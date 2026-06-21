import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { supabaseForUser } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.max(
    1,
    Math.min(200, Number(url.searchParams.get("limit") || 50))
  );

  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  // order_attributions/influencer_payouts/referral_clicks are RLS-gated; under
  // NextAuth use the service-role seam scoped by user.id.
  const sb = supabaseForUser(user.id);

  // Orders (attributions)
  const { data: orders } = await sb
    .from("order_attributions")
    .select(
      "created_at, commission_amount, attributed_by, promo_code_id, promo_codes:promo_code_id ( code )"
    )
    .eq("influencer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Payouts
  const { data: payouts } = await sb
    .from("influencer_payouts")
    .select("created_at, amount, status")
    .eq("influencer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  // OPTIONAL: clicks if you have influencer_id on referral_clicks
  let clicks: any[] = [];
  try {
    const q = await sb
      .from("referral_clicks")
      .select("clicked_at")
      .eq("influencer_id", user.id)
      .order("clicked_at", { ascending: false })
      .limit(Math.min(100, limit));
    if (!q.error) clicks = q.data ?? [];
  } catch {}

  const feed: any[] = [];

  (orders ?? []).forEach((o: any) => {
    const code = o?.promo_codes?.code ? ` (${o.promo_codes.code})` : "";
    feed.push({
      type: "order",
      at: o.created_at,
      text: `Order attributed${code}`,
      amount: Number(o.commission_amount || 0),
    });
  });

  (payouts ?? []).forEach((p: any) => {
    feed.push({
      type: "payout",
      at: p.created_at,
      text: `Payout ${String(p.status || "initiated")}`,
      amount: Number(p.amount || 0),
    });
  });

  clicks.forEach((c: any) => {
    feed.push({
      type: "click",
      at: c.clicked_at,
      text: "Referral link clicked",
    });
  });

  feed.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return NextResponse.json({ ok: true, activity: feed.slice(0, limit) });
}
