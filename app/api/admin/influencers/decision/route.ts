export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// POST /api/admin/influencers/decision — approve or reject an influencer request.
//   { action: "approve", request_id, cap, def, regions }  -> approve_influencer
//   { action: "reject",  request_id }                     -> reject_influencer
// Both RPCs take the request id explicitly (no auth.uid()), so service-role works
// under NextAuth. Admin-only (requireAdmin).
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({} as any));
  const sb = admin();

  // Dual-write: influencer_requests + influencer_profiles are read from MySQL
  // (/api/influencer/status, the active flag). Mirror after the RPC. Capture the
  // user_id BEFORE the RPC since approve may transform the request row.
  const mirror = async (userId: string | null, withProfile: boolean) => {
    if (!userId) return;
    try {
      const { mirrorInfluencerRequestIntoMysql, mirrorInfluencerProfileIntoMysql } = await import("@/lib/data/influencer");
      await mirrorInfluencerRequestIntoMysql(sb, userId);
      if (withProfile) await mirrorInfluencerProfileIntoMysql(sb, userId);
    } catch (err) {
      console.error("[dual-write] influencer decision MySQL mirror failed:", err);
    }
  };

  if (body.action === "approve") {
    if (!body.request_id) return json({ ok: false, error: "request_id required" }, 400);
    const { data: pre } = await sb.from("influencer_requests").select("user_id").eq("id", body.request_id).maybeSingle();
    const { error: e } = await sb.rpc("approve_influencer", {
      p_request_id: body.request_id,
      p_cap_pct: Number(body.cap),
      p_default_discount_pct: Number(body.def),
      p_applicable_countries: Array.isArray(body.regions) ? body.regions : [],
    });
    if (e) return json({ ok: false, error: e.message }, 500);
    await mirror((pre as any)?.user_id ?? null, true);
    return json({ ok: true });
  }

  if (body.action === "reject") {
    if (!body.request_id) return json({ ok: false, error: "request_id required" }, 400);
    const { data: pre } = await sb.from("influencer_requests").select("user_id").eq("id", body.request_id).maybeSingle();
    const { error: e } = await sb.rpc("reject_influencer", { p_request_id: body.request_id });
    if (e) return json({ ok: false, error: e.message }, 500);
    await mirror((pre as any)?.user_id ?? null, false);
    return json({ ok: true });
  }

  return json({ ok: false, error: "BAD_ACTION" }, 400);
}
