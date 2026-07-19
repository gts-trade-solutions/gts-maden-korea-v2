// app/api/influencer/request/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";
import { requireEmailVerified } from "@/lib/auth/emailVerification";
import { createAdminNotification } from "@/lib/admin/notifications";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { user } = await getRouteAuth(req);
  if (!user) return json({ ok: false, error: "UNAUTH" }, 401);

  // Email verification gate. K-Partnership is a real business
  // relationship — never want to onboard partners on un-reachable emails.
  const block = await requireEmailVerified(user.id);
  if (block) {
    return json(
      { ok: false, error: block.message, code: "email_not_verified" },
      403
    );
  }

  // Already an influencer?
  const infl = await prisma.influencer_profiles.findUnique({
    where: { user_id: user.id },
    select: { active: true },
  });
  if (infl?.active)
    return json({
      ok: true,
      status: "influencer",
      message: "Already approved",
    });

  // Existing request? influencer_requests.user_id is UNIQUE (one row per user),
  // so re-applying after a rejection updates that row instead of inserting.
  const last = await prisma.influencer_requests.findUnique({
    where: { user_id: user.id },
    select: { id: true, status: true, created_at: true },
  });

  if (last?.status === "pending") {
    return json({
      ok: true,
      status: "pending",
      requested_at: last.created_at,
      message: "Request already pending",
    });
  }

  const handle = (body.handle || "").trim() || null;
  const note = (body.note || "").trim() || null;
  const social = body.social ?? {};

  // Create (or re-apply after rejection). `social` is NOT NULL in MySQL, so it
  // is always written explicitly.
  let created: { id: string; created_at: Date };
  try {
    created = await prisma.influencer_requests.upsert({
      where: { user_id: user.id },
      create: {
        id: randomUUID(),
        user_id: user.id,
        handle,
        note,
        social,
        status: "pending",
      },
      update: {
        handle,
        note,
        social,
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        updated_at: new Date(),
      },
      select: { id: true, created_at: true },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "REQUEST_FAILED" }, 400);
  }

  // Admin bell notification.
  void createAdminNotification({
    type: "kpartnership_requested",
    title: `New K-Partnership application${body.handle ? ` from @${String(body.handle).trim()}` : ""}`,
    body: note,
    link: "/admin/influencers",
    severity: "info",
    meta: { request_id: created.id, user_id: user.id, handle: body.handle ?? null },
    createdBy: user.id,
  });

  return json({
    ok: true,
    status: "pending",
    requested_at: created.created_at,
    message: "Request submitted",
  });
}
