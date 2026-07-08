export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin: order detail slices (MySQL/Prisma). Admin-gated.
//
// `?active=1` returns just the active shipment row (for the create-guard);
// otherwise returns { order, items, payment, shipment } mirroring the page's
// load() reads.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const orderId = params.id;
  if (!orderId) return json({ ok: false, error: "MISSING_ID" }, 400);

  try {
    // Create-guard check: the single active shipment for this order.
    if (new URL(req.url).searchParams.get("active") === "1") {
      const data = await prisma.dtdc_shipments.findFirst({
        where: { order_id: orderId, is_active: true },
      });
      return json({ ok: true, shipment: jsonSafe(data ?? null) });
    }

    const [ord, its, ship, pays] = await Promise.all([
      prisma.orders.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          order_number: true,
          status: true,
          currency: true,
          subtotal: true,
          shipping_fee: true,
          discount_total: true,
          total: true,
          subtotal_inr: true,
          shipping_fee_inr: true,
          discount_total_inr: true,
          total_inr: true,
          fx_rate_snapshot: true,
          address_snapshot: true,
          created_at: true,
          user_id: true,
        },
      }),
      prisma.order_items.findMany({
        where: { order_id: orderId },
        select: {
          product_id: true,
          sku: true,
          name: true,
          quantity: true,
          unit_price: true,
          line_total: true,
          mrp: true,
          hero_image_path: true,
        },
      }),
      prisma.dtdc_shipments.findMany({
        where: { order_id: orderId },
        select: {
          id: true,
          reference_number: true,
          status: true,
          is_active: true,
          last_error: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
        take: 1,
      }),
      prisma.payments.findMany({
        where: { order_id: orderId },
        orderBy: { created_at: "desc" },
        take: 1,
      }),
    ]);

    return json(
      jsonSafe({
        ok: true,
        order: ord ?? null,
        items: its ?? [],
        shipment: (ship ?? [])[0] ?? null,
        payment: (pays ?? [])[0] ?? null,
      })
    );
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
