// app/api/influencer/status/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { user, sb } = await getRouteAuth();
  if (!user) return json({ ok: false, error: "UNAUTH" }, 401);

  if (process.env.CATALOG_BACKEND === "mysql") {
    try {
      const { getInfluencerStatusMysql } = await import("@/lib/data/influencer");
      const s = await getInfluencerStatusMysql(user.id);
      return json({ ok: true, ...s });
    } catch (e) {
      console.error("[influencer/status] MySQL read failed, falling back to Supabase:", e);
    }
  }

  // Resolve status
  const { data: prof } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role === "admin" || prof?.role === "super_admin")
    return json({ ok: true, status: "admin", requested_at: null });

  const { data: infl } = await sb
    .from("influencer_profiles")
    .select("active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (infl?.active)
    return json({ ok: true, status: "influencer", requested_at: null });

  const { data: req } = await sb
    .from("influencer_requests")
    .select("status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (req?.status === "pending")
    return json({ ok: true, status: "pending", requested_at: req.created_at });
  if (req?.status === "rejected")
    return json({ ok: true, status: "rejected", requested_at: req.created_at });

  return json({ ok: true, status: "none", requested_at: null });
}
