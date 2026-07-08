export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only role toggle + hard-delete for /admin/users.
//
// PATCH /api/admin/users/[user_id]
//   body: { role: "customer" | "admin" }
//
//   Safety rails:
//     1. Cannot demote a super_admin.
//     2. Cannot demote yourself — prevents accidental self-lockout.
//     3. Cannot drop the last admin — the app would be unusable.
//     4. Cannot set role to anything other than "customer" or "admin".
//        Promoting to super_admin is DB-only on purpose.
//
// DELETE /api/admin/users/[user_id]
//   body: { confirmEmail: string }  // must match the user's current email
//
//   Hard-deletes the user's MySQL rows (auth_users + profiles). Cascading
//   FKs handle most cleanup (orders, carts, addresses, wishlist, reviews via
//   SET NULL, etc.). A few admin-content tables have NO ACTION FKs that
//   would block the delete — we null those out defensively first.
//
//   Safety rails:
//     - confirmEmail must match (case-insensitive)
//     - Cannot delete admin / super_admin / vendor / self
//     - Returns the list of cleared/affected tables so the UI can show
//       a small breakdown

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function PATCH(
  req: Request,
  { params }: { params: { user_id: string } }
) {
  const { user: caller, error } = await requireAdmin(req);
  if (error) return error;

  const targetId = params.user_id;
  const body = await req.json().catch(() => ({}));
  const nextRole = String(body.role || "").toLowerCase();

  if (nextRole !== "customer" && nextRole !== "admin") {
    return json(
      { ok: false, error: "INVALID_ROLE", code: "INVALID_ROLE" },
      400
    );
  }

  // Safety rail 2: no self-demote.
  if (nextRole === "customer" && targetId === caller!.id) {
    return json(
      { ok: false, error: "CANNOT_DEMOTE_SELF", code: "CANNOT_DEMOTE_SELF" },
      400
    );
  }

  // Read the current role to apply rails 1 + 3.
  let current: { role: string } | null;
  try {
    current = await prisma.profiles.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message }, 500);
  }
  if (!current) return json({ ok: false, error: "NOT_FOUND" }, 404);

  // Safety rail 1: super_admin is immune to demotion via this API.
  if (current.role === "super_admin") {
    return json(
      {
        ok: false,
        error: "CANNOT_MODIFY_SUPER_ADMIN",
        code: "CANNOT_MODIFY_SUPER_ADMIN",
      },
      403
    );
  }

  // Safety rail 3: don't drop the last admin. Only matters when demoting.
  // Counts admin + super_admin together.
  if (current.role === "admin" && nextRole === "customer") {
    let count: number;
    try {
      count = await prisma.profiles.count({
        where: { role: { in: ["admin", "super_admin"] } },
      });
    } catch (e: any) {
      return json({ ok: false, error: e?.message }, 500);
    }
    if ((count ?? 0) <= 1) {
      return json(
        {
          ok: false,
          error: "LAST_ADMIN_GUARD",
          code: "LAST_ADMIN_GUARD",
        },
        400
      );
    }
  }

  // No-op early-out: avoid a write + revalidation when nothing changes.
  if (current.role === nextRole) {
    return json({ ok: true, role: nextRole, no_op: true });
  }

  let updated: { id: string; role: string } | null = null;
  try {
    updated = await prisma.profiles.update({
      where: { id: targetId },
      data: { role: nextRole, updated_at: new Date() },
      select: { id: true, role: true },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message }, 500);
  }

  return json({ ok: true, role: updated?.role ?? nextRole });
}

export async function DELETE(
  req: Request,
  { params }: { params: { user_id: string } }
) {
  const { user: caller, error } = await requireAdmin(req);
  if (error) return error;

  const targetId = params.user_id;
  if (!targetId) return json({ ok: false, error: "MISSING_ID" }, 400);

  const body = await req.json().catch(() => ({}));
  const confirmEmailRaw = String(body?.confirmEmail || "").trim().toLowerCase();

  if (targetId === caller!.id) {
    return json(
      { ok: false, error: "CANNOT_DELETE_SELF", code: "CANNOT_DELETE_SELF" },
      400
    );
  }

  // Look up the target's email (auth_users / prisma.user) + role (profiles)
  // to enforce safety rails.
  const [authUser, prof] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetId }, select: { email: true } }),
    prisma.profiles.findUnique({ where: { id: targetId }, select: { role: true } }),
  ]);
  const targetEmail = (authUser?.email ?? "").toLowerCase();
  if (!authUser) {
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }

  if (prof?.role === "admin" || prof?.role === "super_admin") {
    return json(
      {
        ok: false,
        error: "CANNOT_DELETE_STAFF",
        code: "CANNOT_DELETE_STAFF",
        message: "Staff accounts (admin / super_admin) cannot be deleted from this page. Demote them to customer first if needed.",
      },
      403
    );
  }

  // Block vendor deletion — those are real business records linked to
  // commercial relationships. The FK is on `owner_profile_id`.
  const vendorRow = await prisma.vendors.findFirst({
    where: { owner_profile_id: targetId },
    select: { id: true },
  });
  if (vendorRow) {
    return json(
      {
        ok: false,
        error: "CANNOT_DELETE_VENDOR",
        code: "CANNOT_DELETE_VENDOR",
        message: "This account is a vendor. Remove the vendor record first.",
      },
      403
    );
  }

  if (!confirmEmailRaw) {
    return json(
      { ok: false, error: "MISSING_CONFIRMATION", code: "MISSING_CONFIRMATION" },
      400
    );
  }
  if (confirmEmailRaw !== targetEmail) {
    return json(
      {
        ok: false,
        error: "EMAIL_MISMATCH",
        code: "EMAIL_MISMATCH",
        message: "The confirmation email does not match this account.",
      },
      400
    );
  }

  // Defensive pre-clear of NO ACTION FKs. For a typical test customer,
  // these tables shouldn't reference the user — but if any do, the row
  // delete would fail with a foreign key constraint error. Cheaper to null
  // them than to handle the error. Best-effort: swallow per-table failures
  // (e.g. a NOT NULL column) and record null for that entry.
  const cleared: Record<string, number | null> = {};
  const updateNullable = async (model: string, col: string) => {
    try {
      const res = await (prisma as any)[model].updateMany({
        where: { [col]: targetId },
        data: { [col]: null },
      });
      cleared[`${model}.${col}`] = res?.count ?? 0;
    } catch (e: any) {
      cleared[`${model}.${col}`] = null;
    }
  };

  await Promise.all([
    updateNullable("whatsapp_campaigns", "created_by"),
    updateNullable("whatsapp_contacts", "created_by"),
    updateNullable("whatsapp_templates", "created_by"),
    updateNullable("email_campaign", "created_by"),
    updateNullable("email_contact", "registered_user_id"),
    updateNullable("order_attribution_items", "influencer_id"),
    updateNullable("store_settings", "updated_by"),
  ]);

  // Hard-delete the user's MySQL rows. SECURITY — the NextAuth credentials
  // provider validates the bcrypt hash stored in auth_users, so leaving the
  // auth_users/profiles rows behind would let a "deleted" account keep
  // logging in. Delete profiles first so its own cascading dependents go,
  // then the auth_users row.
  //
  // NOTE: the Supabase Auth deletion (sb.auth.admin.deleteUser) is NOT
  // replicated — see report. Supabase-Auth-side identity/session cleanup is
  // deferred to the auth phase.
  try {
    await prisma.profiles.deleteMany({ where: { id: targetId } });
    await prisma.user.deleteMany({ where: { id: targetId } });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: e?.message,
        cleared,
      },
      500
    );
  }

  return json(
    jsonSafe({
      ok: true,
      deletedUserId: targetId,
      deletedEmail: targetEmail,
      cleared,
    })
  );
}
