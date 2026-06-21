export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

const json = (d:any, s=200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { user, sb } = await getRouteAuth();
  if (!user) return json({ ok: false, error: "UNAUTH" }, 401);

  if (process.env.CATALOG_BACKEND === "mysql") {
    try {
      const { getInfluencerPayoutsMysql } = await import("@/lib/data/influencer");
      return json({ ok: true, payouts: await getInfluencerPayoutsMysql(user.id) });
    } catch (e) {
      console.error("[me/payouts] MySQL read failed, falling back to Supabase:", e);
    }
  }

  const { data, error: err } = await sb
    .from("influencer_payouts")
    .select("id, amount, currency, status, method, request_note, contact_email, settled_reference, created_at, paid_at")
    .eq("influencer_id", user.id)
    .order("created_at", { ascending: false });

  if (err) return json({ ok:false, error: err.message }, 400);
  return json({ ok:true, payouts: data ?? [] });
}
