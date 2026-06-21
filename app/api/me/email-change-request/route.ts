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
import { getRouteUserId } from "@/lib/auth/routeUser";
import { createServiceClient } from "@/lib/supabaseServer";
import { createAdminNotification } from "@/lib/admin/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

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

export async function GET() {
  const userId = await getRouteUserId();
  if (!userId)
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });

  const sb = createServiceClient();
  const { data: row } = await sb
    .from("email_change_requests")
    .select("id, current_email, requested_email, status, reason, admin_note, requested_at, processed_at")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  const sb = createServiceClient();

  // Current email + check it's actually different.
  const { data: authUser } = await sb.auth.admin.getUserById(userId);
  let currentEmail = (authUser?.user?.email ?? "").toLowerCase();
  if (!currentEmail) {
    // OAuth-only users (and the post-Supabase-teardown future) have no Supabase
    // auth row — fall back to the MySQL user email that NextAuth uses.
    try {
      const { prisma } = await import("@/lib/db/prisma");
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      currentEmail = (u?.email ?? "").toLowerCase();
    } catch (e) {
      console.error("[email-change-request] MySQL email fallback failed:", e);
    }
  }
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
  const conflict = await findAuthUserByEmail(sb as any, requested);
  if (conflict && conflict.id !== userId) {
    return NextResponse.json(
      { ok: false, reason: "email_taken" },
      { status: 400 }
    );
  }

  // Rate limit: 3 requests per 7 days.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await sb
    .from("email_change_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("requested_at", cutoff);
  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", message: "You've reached the 3-request limit for this week." },
      { status: 429 }
    );
  }

  // Supersede any prior pending request.
  await sb
    .from("email_change_requests")
    .update({ status: "superseded", processed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "pending");

  const { data: inserted, error } = await sb
    .from("email_change_requests")
    .insert({
      user_id: userId,
      current_email: currentEmail,
      requested_email: requested,
      reason,
    })
    .select("id, current_email, requested_email, status, reason, requested_at")
    .single();

  if (error) {
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
