import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/account/orders — the signed-in user's orders + line items.
// Identity comes from the seam (Supabase session today, NextAuth at the flip).
// Data comes from MySQL when CATALOG_BACKEND=mysql, else Supabase (fallback).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ orders: [], items: [], error: "UNAUTHENTICATED" }, { status: 401 });
  }


  const { prisma } = await import("@/lib/db/prisma");
  const orders = await prisma.orders.findMany({
    where: { user_id: userId },
    select: {
      id: true, order_number: true, status: true, currency: true,
      subtotal: true, shipping_fee: true, discount_total: true, total: true, created_at: true,
    },
    orderBy: { created_at: "desc" },
  });
  const ids = orders.map((o) => o.id);
  const items = ids.length
    ? await prisma.order_items.findMany({
        where: { order_id: { in: ids } },
        select: { order_id: true, product_id: true, name: true, quantity: true, unit_price: true },
      })
    : [];
  return NextResponse.json({ orders: jsonSafe(orders), items: jsonSafe(items) });

}
