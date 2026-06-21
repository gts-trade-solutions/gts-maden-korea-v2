// POST /api/admin/email-change-requests/[id]
//
// Body: { action: "approve" | "reject", adminNote?: string }
//
// Approve flow (the gnarly one):
//   1. Validate the request is still pending.
//   2. Re-check the target email isn't taken by another auth user (race
//      window between submit and approval can be days).
//   3. supabase.auth.admin.updateUserById(userId, { email: requested })
//      — this moves the auth.users.email. We pass email_confirm: false
//      so Supabase doesn't auto-mark email_confirmed_at, since the user
//      still has to prove the new mailbox via our custom flow.
//   4. Reset profiles.email_verified_at = null,
//      email_verification_grace_starts_at = now() — fresh window on the
//      new address.
//   5. Send a fresh verification email to the new address.
//   6. Mark the request approved with admin note.
//
// Reject flow:
//   - Mark status=rejected with admin note. No DB writes elsewhere.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { sendVerificationEmail } from "@/lib/auth/sendVerificationEmail";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

async function findAuthUserByEmail(sb: any, email: string) {
  const target = email.toLowerCase();
  const perPage = 200;
  let page = 1;
  while (page <= 20) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find(
      (u: any) => (u?.email || "").toLowerCase() === target
    );
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user: admin, error } = await requireAdmin(req);
  if (error) return error;

  const requestId = params.id;
  if (!requestId) return json({ ok: false, error: "missing_id" }, 400);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "").trim();
  const adminNote = body?.adminNote ? String(body.adminNote).trim() : null;

  const sb = createServiceClient();
  const { data: row } = await sb
    .from("email_change_requests")
    .select("id, user_id, current_email, requested_email, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!row) return json({ ok: false, error: "not_found" }, 404);
  if (row.status !== "pending")
    return json({ ok: false, error: "not_pending", currentStatus: row.status }, 400);

  if (action === "reject") {
    const { error: upErr } = await sb
      .from("email_change_requests")
      .update({
        status: "rejected",
        admin_note: adminNote,
        processed_at: new Date().toISOString(),
        processed_by: admin!.id,
      })
      .eq("id", requestId);
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
    return json({ ok: true });
  }

  if (action === "approve") {
    const requested = String(row.requested_email).toLowerCase();
    const userId = String(row.user_id);

    // Re-check email availability — request may have been submitted days
    // ago and the target address could be taken now.
    const conflict = await findAuthUserByEmail(sb as any, requested);
    if (conflict && conflict.id !== userId) {
      return json(
        { ok: false, error: "email_taken_now", message: "Another account claimed this email since the request was submitted." },
        400
      );
    }

    // Move the auth.users.email. `email_confirm: false` ensures Supabase
    // does NOT mark email_confirmed_at — the user still must prove the
    // new mailbox via our custom verification flow.
    const { error: updErr } = await sb.auth.admin.updateUserById(userId, {
      email: requested,
      email_confirm: false,
    } as any);
    if (updErr)
      return json({ ok: false, error: updErr.message }, 500);

    // Reset verification state — fresh window for the new address.
    await sb
      .from("profiles")
      .update({
        email_verified_at: null,
        email_verification_grace_starts_at: new Date().toISOString(),
        email_verification_deadline_override: null,
      })
      .eq("id", userId);

    // Dual-write to MySQL. NextAuth login matches on prisma.user.email, and the
    // verification gate reads profiles from MySQL under nextauth — so without
    // this the user would change their email yet still have to log in with the
    // OLD one, and the reset verification window wouldn't take effect.
    try {
      const { prisma } = await import("@/lib/db/prisma");
      await prisma.user.updateMany({ where: { id: userId }, data: { email: requested } });
      await prisma.profiles.updateMany({
        where: { id: userId },
        data: {
          email_verified_at: null,
          email_verification_grace_starts_at: new Date(),
          email_verification_deadline_override: null,
        },
      });
    } catch (e) {
      console.error("[email-change-approve] MySQL dual-write failed:", e);
    }

    // Fire a fresh verification email to the new address.
    try {
      await sendVerificationEmail({
        userId,
        email: requested,
        origin: new URL(req.url).origin,
      });
    } catch (e) {
      console.error("[email-change-approve] verification email failed:", e);
      // Don't fail the whole approval — admin can re-trigger via
      // /admin/users → Resend verification.
    }

    // Mark the request approved.
    await sb
      .from("email_change_requests")
      .update({
        status: "approved",
        admin_note: adminNote,
        processed_at: new Date().toISOString(),
        processed_by: admin!.id,
      })
      .eq("id", requestId);

    return json({ ok: true });
  }

  return json({ ok: false, error: "invalid_action" }, 400);
}
