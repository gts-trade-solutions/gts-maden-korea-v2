export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
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

export async function GET() {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const [
    totalOrders,
    paidOrders,
    publishedProducts,
    totalProducts,
    approvedVendors,
    totalVendors,
    revenueAgg,
  ] = await Promise.all([
    prisma.orders.count(),
    prisma.orders.count({ where: { status: "paid" } }),
    prisma.products.count({ where: { is_published: true } }),
    prisma.products.count(),
    prisma.vendors.count({ where: { status: "approved" } }),
    prisma.vendors.count(),
    prisma.orders.aggregate({
      _sum: { total: true },
      where: { status: "paid", currency: "INR" },
    }),
  ]);

  const revenueInr = revenueAgg._sum.total ? Number(revenueAgg._sum.total) : 0;

  return json({
    ok: true,
    metrics: jsonSafe({
      total_orders: totalOrders ?? 0,
      paid_orders: paidOrders ?? 0,
      revenue_inr: revenueInr,
      published_products: publishedProducts ?? 0,
      total_products: totalProducts ?? 0,
      approved_vendors: approvedVendors ?? 0,
      total_vendors: totalVendors ?? 0,
    }),
  });
}
