// app/api/me/promos/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

const json = (d:any, s=200) => NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { user, sb } = await getRouteAuth();
  if (!user) return json({ ok: false, error: "UNAUTH" }, 401);

  if (process.env.CATALOG_BACKEND === "mysql") {
    try {
      const { getAllPromosMysql } = await import("@/lib/data/influencer");
      return json({ ok: true, promos: await getAllPromosMysql(user.id) });
    } catch (e) {
      console.error("[me/promos] MySQL read failed, falling back to Supabase:", e);
    }
  }

  // Pull promos for this influencer
  const { data: promos, error: err } = await sb
    .from("promo_codes")
    .select("id, code, scope, product_id, discount_percent, commission_percent, active, uses")
    .eq("influencer_id", user.id)
    .order("created_at", { ascending: false });

  if (err) return json({ ok:false, error: err.message }, 400);

  // Attach product names for product-scoped promos
  const ids = Array.from(new Set((promos ?? []).map(p => p.product_id).filter(Boolean))) as string[];
  let map: Record<string, { name: string, slug: string }> = {};
  if (ids.length) {
    const { data: products } = await sb
      .from("products")
      .select("id, name, slug")
      .in("id", ids as any);
    for (const p of products ?? []) map[p.id as string] = { name: p.name as string, slug: p.slug as string };
  }

  const out = (promos ?? []).map(p => ({
    ...p,
    product_name: p.product_id ? map[p.product_id]?.name ?? null : null,
    product_slug: p.product_id ? map[p.product_id]?.slug ?? null : null,
  }));

  return json({ ok:true, promos: out });
}
