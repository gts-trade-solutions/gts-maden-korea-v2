export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only role toggle + hard-delete for /admin/users.
//
// PATCH /api/admin/users/[user_id]
//   body: { role: "customer" | "admin" }
//
//   Safety rails:
//     1. Cannot demote a super_admin — the DB trigger guard_super_admin_role
//        catches this too, but we return a friendly error here first so
//        the UI shows something better than "42501 forbidden".
//     2. Cannot demote yourself — prevents accidental self-lockout.
//     3. Cannot drop the last admin — the app would be unusable.
//     4. Cannot set role to anything other than "customer" or "admin".
//        Promoting to super_admin is DB-only on purpose.
//
// DELETE /api/admin/users/[user_id]
//   body: { confirmEmail: string }  // must match the user's current email
//
//   Hard-deletes the auth.users row. Cascading FKs handle most cleanup
//   (profiles, orders, carts, addresses, wishlist, reviews via
//   SET NULL, etc.). A few admin-content tables have NO ACTION FKs that
//   would block the delete — we null those out defensively before
//   calling auth.admin.deleteUser().
//
//   Safety rails:
//     - confirmEmail must match (case-insensitive)
//     - Cannot delete admin / super_admin / vendor / self — these
//       represent real business records and shouldn't be one-click
//       deletable
//     - Returns the list of cleared/affected tables so the UI can show
//       a small breakdown

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

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

  // Safety rail 2: no self-demote. (Promoting yourself doesn't apply
  // — you're already an admin, and there's no path to super_admin.)
  if (nextRole === "customer" && targetId === caller!.id) {
    return json(
      { ok: false, error: "CANNOT_DEMOTE_SELF", code: "CANNOT_DEMOTE_SELF" },
      400
    );
  }

  const sb = admin();

  // Read the current role to apply rails 1 + 3.
  const { data: current, error: rdErr } = await sb
    .from("profiles")
    .select("role")
    .eq("id", targetId)
    .maybeSingle();
  if (rdErr) return json({ ok: false, error: rdErr.message }, 500);
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

  // Safety rail 3: don't drop the last admin. Only matters when
  // demoting. Counts admin + super_admin together — but since
  // super_admin can't be demoted, the only way to hit "0 admins" is
  // if there's no super_admin AND we're demoting the last admin.
  if (current.role === "admin" && nextRole === "customer") {
    const { count, error: cntErr } = await sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ["admin", "super_admin"]);
    if (cntErr) return json({ ok: false, error: cntErr.message }, 500);
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

  const { data, error: upErr } = await sb
    .from("profiles")
    .update({ role: nextRole, updated_at: new Date().toISOString() })
    .eq("id", targetId)
    .select("id, role")
    .maybeSingle();
  if (upErr) {
    // Surface PostgreSQL trigger errors with a stable code so the UI
    // can map to a translated string if needed.
    if ((upErr as any).code === "42501") {
      return json(
        {
          ok: false,
          error: "CANNOT_MODIFY_SUPER_ADMIN",
          code: "CANNOT_MODIFY_SUPER_ADMIN",
        },
        403
      );
    }
    return json({ ok: false, error: upErr.message }, 500);
  }

  // Dual-write: mirror the role into MySQL. The NextAuth JWT reads role from
  // MySQL (profiles.role), so a stale mirror would grant or deny admin access
  // incorrectly until the next full sync.
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.profiles.update({
      where: { id: targetId },
      data: { role: nextRole, updated_at: new Date() },
    });
  } catch (e) {
    console.error("[dual-write] role change MySQL mirror failed:", e);
  }

  return json({ ok: true, role: data?.role ?? nextRole });
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

  const sb = admin();

  // Look up the target's email + role to enforce safety rails.
  const [{ data: authUserRes }, { data: prof }] = await Promise.all([
    sb.auth.admin.getUserById(targetId),
    sb.from("profiles").select("role").eq("id", targetId).maybeSingle(),
  ]);
  const targetEmail = (authUserRes?.user?.email ?? "").toLowerCase();
  if (!authUserRes?.user) {
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
  // commercial relationships. Admin can demote vendors via the vendor
  // admin pages first if a hard delete is genuinely needed.
  //
  // The FK is on `owner_profile_id` (not `user_id`) — the earlier
  // mistake silently no-op'd the check, but it would have surfaced
  // anyway once we hit a real vendor account.
  const { data: vendorRow } = await sb
    .from("vendors")
    .select("id")
    .eq("owner_profile_id", targetId)
    .maybeSingle();
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
  // these tables shouldn't reference the user — but if any do, the auth
  // delete would fail with "violates foreign key constraint". Cheaper
  // to null them than to handle the error.
  const cleared: Record<string, number | null> = {};
  const updateNullable = async (table: string, col: string) => {
    try {
      const { data, error: uErr } = await sb
        .from(table)
        .update({ [col]: null })
        .eq(col, targetId)
        .select("id");
      cleared[`${table}.${col}`] = uErr ? null : (data?.length ?? 0);
    } catch (e: any) {
      // If the table doesn't exist in this env, swallow — best-effort.
      cleared[`${table}.${col}`] = null;
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

  // Delete the auth row. Cascading FKs handle the rest (profiles,
  // orders, carts, addresses, wishlist, reviews → SET NULL,
  // influencer_*, referral_*, etc.).
  const { error: delErr } = await sb.auth.admin.deleteUser(targetId);
  if (delErr) {
    return json(
      {
        ok: false,
        error: delErr.message,
        cleared,
      },
      500
    );
  }

  // Dual-write: remove the user from MySQL too. SECURITY — the NextAuth
  // credentials provider validates the bcrypt hash stored in MySQL, so leaving
  // the MySQL user/profile behind would let a "deleted" account keep logging in.
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.profiles.deleteMany({ where: { id: targetId } });
    await prisma.user.deleteMany({ where: { id: targetId } });
  } catch (e) {
    console.error("[dual-write] user delete MySQL cleanup failed:", e);
  }

  return json({
    ok: true,
    deletedUserId: targetId,
    deletedEmail: targetEmail,
    cleared,
  });
}
