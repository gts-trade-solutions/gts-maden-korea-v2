export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin dashboard top-level metrics for /admin.
//
// Response:
//   {
//     ok: true,
//     metrics: {
//       total_orders, paid_orders, revenue_inr,
//       published_products, total_products,
//       approved_vendors, total_vendors
//     }
//   }
//
// `revenue_inr` is the SUM of `total` across paid orders that store
// their value in INR — international (non-INR) orders are excluded
// from the headline figure rather than mixed-currency-summed (which
// would produce a meaningless number). For a multi-currency view see
// /admin/analytics.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const sb = admin();

  // All count queries use head:true so PostgREST returns only the
  // count header — no row payload. We tried `.select('total.sum()')`
  // (PostgREST aggregate select) for revenue first, but it requires
  // `db-aggregates-enabled` in the PostgREST config and Supabase ships
  // with that off by default. Falling back to fetching the totals and
  // summing in JS — simple, no DB migration needed, and the row
  // payload is small (one numeric column per paid INR order).
  const [
    totalOrders,
    paidOrders,
    publishedProducts,
    totalProducts,
    approvedVendors,
    totalVendors,
  ] = await Promise.all([
    sb.from("orders").select("id", { count: "exact", head: true }),
    sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid"),
    sb
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    sb.from("products").select("id", { count: "exact", head: true }),
    sb
      .from("vendors")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    sb.from("vendors").select("id", { count: "exact", head: true }),
  ]);

  // Page through paid INR order totals and sum. Chunk size matches
  // the PostgREST default so we never need to bump max-rows. Stops
  // as soon as a page returns fewer rows than the chunk (last page).
  const CHUNK = 1000;
  let revenueInr = 0;
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("orders")
      .select("total")
      .eq("status", "paid")
      .eq("currency", "INR")
      .range(offset, offset + CHUNK - 1);
    if (error || !data) break;
    for (const row of data as Array<{ total: number | string | null }>) {
      const v = Number(row.total ?? 0);
      if (Number.isFinite(v)) revenueInr += v;
    }
    if (data.length < CHUNK) break;
    offset += CHUNK;
  }

  return json({
    ok: true,
    metrics: {
      total_orders: totalOrders.count ?? 0,
      paid_orders: paidOrders.count ?? 0,
      revenue_inr: revenueInr,
      published_products: publishedProducts.count ?? 0,
      total_products: totalProducts.count ?? 0,
      approved_vendors: approvedVendors.count ?? 0,
      total_vendors: totalVendors.count ?? 0,
    },
  });
}
