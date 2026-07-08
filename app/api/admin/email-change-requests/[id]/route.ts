// POST /api/admin/email-change-requests/[id]
//
// Body: { action: "approve" | "reject", adminNote?: string }
//
// Approve flow (the gnarly one):
//   1. Validate the request is still pending.
//   2. Re-check the target email isn't taken by another auth user (race
//      window between submit and approval can be days).
//   3. Move the auth user's email (auth_users / prisma.user). NextAuth login
//      matches on prisma.user.email, so this is what lets the user log in with
//      the new address.
//   4. Reset profiles.email_verified_at = null,
//      email_verification_grace_starts_at = now() — fresh window on the
//      new address (the verification gate reads profiles from MySQL).
//   5. Send a fresh verification email to the new address.
//   6. Mark the request approved with admin note.
//
// Reject flow:
//   - Mark status=rejected with admin note. No DB writes elsewhere.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { sendVerificationEmail } from "@/lib/auth/sendVerificationEmail";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

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

  const row = await prisma.email_change_requests.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      user_id: true,
      current_email: true,
      requested_email: true,
      status: true,
    },
  });

  if (!row) return json({ ok: false, error: "not_found" }, 404);
  if (row.status !== "pending")
    return json({ ok: false, error: "not_pending", currentStatus: row.status }, 400);

  if (action === "reject") {
    try {
      await prisma.email_change_requests.update({
        where: { id: requestId },
        data: {
          status: "rejected",
          admin_note: adminNote,
          processed_at: new Date(),
          processed_by: admin!.id,
        },
      });
    } catch (e: any) {
      return json({ ok: false, error: e?.message ?? "update_failed" }, 500);
    }
    return json({ ok: true });
  }

  if (action === "approve") {
    const requested = String(row.requested_email).toLowerCase();
    const userId = String(row.user_id);

    // Re-check email availability — request may have been submitted days
    // ago and the target address could be taken now.
    const conflict = await prisma.user.findFirst({
      where: { email: requested },
      select: { id: true },
    });
    if (conflict && conflict.id !== userId) {
      return json(
        { ok: false, error: "email_taken_now", message: "Another account claimed this email since the request was submitted." },
        400
      );
    }

    // Move the auth user's email. NextAuth login matches on prisma.user.email,
    // so without this the user would change their email yet still have to log
    // in with the OLD one.
    try {
      await prisma.user.updateMany({
        where: { id: userId },
        data: { email: requested },
      });
    } catch (e: any) {
      return json({ ok: false, error: e?.message ?? "auth_update_failed" }, 500);
    }

    // Reset verification state — fresh window for the new address. The
    // verification gate reads profiles from MySQL.
    await prisma.profiles.updateMany({
      where: { id: userId },
      data: {
        email_verified_at: null,
        email_verification_grace_starts_at: new Date(),
        email_verification_deadline_override: null,
      },
    });

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
    await prisma.email_change_requests.update({
      where: { id: requestId },
      data: {
        status: "approved",
        admin_note: adminNote,
        processed_at: new Date(),
        processed_by: admin!.id,
      },
    });

    return json({ ok: true });
  }

  return json({ ok: false, error: "invalid_action" }, 400);
}
