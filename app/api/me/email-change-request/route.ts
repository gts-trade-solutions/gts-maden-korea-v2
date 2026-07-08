// /api/me/email-change-request
//
// GET  — returns the signed-in user's most recent request (or null)
// POST — submits a new request. Body: { requestedEmail, reason? }
//
// Rules:
//   - Auth required.
//   - `requestedEmail` must be a valid email and not equal to the
//     current address.
//   - `requestedEmail` must not already belong to another auth user.
//   - At most 1 pending request per user — submitting a new one marks
//     the prior pending as `superseded`.
//   - Rate limit: max 3 requests in any rolling 7 days.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRouteUserId } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";
import { createAdminNotification } from "@/lib/admin/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function GET() {
  const userId = await getRouteUserId();
  if (!userId)
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const row = await prisma.email_change_requests.findFirst({
    where: { user_id: userId },
    orderBy: { requested_at: "desc" },
    select: {
      id: true,
      current_email: true,
      requested_email: true,
      status: true,
      reason: true,
      admin_note: true,
      requested_at: true,
      processed_at: true,
    },
  });

  return NextResponse.json({ ok: true, request: row ?? null });
}

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId)
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const requestedRaw = String(body?.requestedEmail ?? "").trim();
  const reason = String(body?.reason ?? "").trim() || null;
  const requested = requestedRaw.toLowerCase();

  if (!requested || !isValidEmail(requested)) {
    return NextResponse.json(
      { ok: false, reason: "invalid_email" },
      { status: 400 }
    );
  }

  // Current email — from the NextAuth user row.
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const currentEmail = (currentUser?.email ?? "").toLowerCase();
  if (!currentEmail) {
    return NextResponse.json(
      { ok: false, reason: "no_current_email" },
      { status: 400 }
    );
  }
  if (currentEmail === requested) {
    return NextResponse.json(
      { ok: false, reason: "same_email" },
      { status: 400 }
    );
  }

  // Make sure no other auth user is using the requested address. We allow
  // submitting if the address belongs to nobody, OR if it somehow already
  // belongs to the same user (edge case: previously rejected request).
  const conflict = await prisma.user.findUnique({
    where: { email: requested },
    select: { id: true },
  });
  if (conflict && conflict.id !== userId) {
    return NextResponse.json(
      { ok: false, reason: "email_taken" },
      { status: 400 }
    );
  }

  // Rate limit: 3 requests per 7 days.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const count = await prisma.email_change_requests.count({
    where: { user_id: userId, requested_at: { gte: cutoff } },
  });
  if (count >= 3) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", message: "You've reached the 3-request limit for this week." },
      { status: 429 }
    );
  }

  // Supersede any prior pending request.
  await prisma.email_change_requests.updateMany({
    where: { user_id: userId, status: "pending" },
    data: { status: "superseded", processed_at: new Date() },
  });

  let inserted;
  try {
    inserted = await prisma.email_change_requests.create({
      data: {
        id: randomUUID(),
        user_id: userId,
        current_email: currentEmail,
        requested_email: requested,
        reason,
      },
      select: {
        id: true,
        current_email: true,
        requested_email: true,
        status: true,
        reason: true,
        requested_at: true,
      },
    });
  } catch (error) {
    console.error("[email-change-request] insert failed:", error);
    return NextResponse.json(
      { ok: false, reason: "internal_error" },
      { status: 500 }
    );
  }

  // Admin bell notification.
  void createAdminNotification({
    type: "email_change_requested",
    title: `Email change request from ${currentEmail}`,
    body: `→ ${requested}${reason ? ` · ${reason}` : ""}`,
    link: "/admin/users",
    severity: "info",
    meta: { request_id: inserted.id, user_id: userId, requested_email: requested },
    createdBy: userId,
  });

  return NextResponse.json({ ok: true, request: inserted });
}
