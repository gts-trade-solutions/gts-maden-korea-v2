// app/api/influencer/request/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { supabaseForUser } from "@/lib/supabaseRoute";
import { requireEmailVerified } from "@/lib/auth/emailVerification";
import { createAdminNotification } from "@/lib/admin/notifications";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { user } = await getRouteAuth(req);
  if (!user) return json({ ok: false, error: "UNAUTH" }, 401);

  // NextAuth has no Supabase session — the influencer_profiles/_requests reads
  // and the request insert + mirror need a service-role client scoped by user.id
  // (otherwise the insert is RLS-denied and applications can't be submitted).
  const sb = supabaseForUser(user.id);

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
  const { data: infl } = await sb
    .from("influencer_profiles")
    .select("active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (infl?.active)
    return json({
      ok: true,
      status: "influencer",
      message: "Already approved",
    });

  // Existing request?
  const { data: last } = await sb
    .from("influencer_requests")
    .select("id, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last?.status === "pending") {
    return json({
      ok: true,
      status: "pending",
      requested_at: last.created_at,
      message: "Request already pending",
    });
  }

  // Create (or re-apply after rejection)
  const { data: created, error } = await sb
    .from("influencer_requests")
    .insert({
      user_id: user.id,
      handle: (body.handle || "").trim() || null,
      note: (body.note || "").trim() || null,
      social: body.social ?? {},
      status: "pending",
    })
    .select("id, created_at")
    .single();

  if (error) return json({ ok: false, error: error.message }, 400);

  // Mirror the application into MySQL (the status route reads it from MySQL).
  try {
    const { mirrorInfluencerRequestIntoMysql } = await import("@/lib/data/influencer");
    await mirrorInfluencerRequestIntoMysql(sb, user.id);
  } catch (e) {
    console.error("[dual-write] influencer request MySQL mirror failed:", e);
  }

  // Admin bell notification.
  void createAdminNotification({
    type: "kpartnership_requested",
    title: `New K-Partnership application${body.handle ? ` from @${String(body.handle).trim()}` : ""}`,
    body: (body.note || "").trim() || null,
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
