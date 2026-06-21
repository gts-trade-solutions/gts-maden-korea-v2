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

  if (process.env.CATALOG_BACKEND === "mysql") {
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

  // Supabase fallback (default)
  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { data: orders } = await sb
    .from("orders")
    .select("id, order_number, status, currency, subtotal, shipping_fee, discount_total, total, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const ids = (orders ?? []).map((o: any) => o.id);
  const items = ids.length
    ? (await sb.from("order_items").select("order_id, product_id, name, quantity, unit_price").in("order_id", ids)).data ?? []
    : [];
  return NextResponse.json({ orders: orders ?? [], items });
}
