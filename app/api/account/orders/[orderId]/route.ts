import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/account/orders/[orderId] — one order (ownership-checked) + items +
// active DTDC shipment + latest payment. Identity from the seam; data from
// MySQL (flag) with Supabase fallback.
export async function GET(_req: Request, { params }: { params: { orderId: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const orderId = params.orderId;


  const { prisma } = await import("@/lib/db/prisma");
  const order = await prisma.orders.findFirst({
    where: { id: orderId, user_id: userId },
    select: {
      id: true, user_id: true, order_number: true, status: true, currency: true,
      subtotal: true, shipping_fee: true, discount_total: true, total: true,
      address_snapshot: true, created_at: true, payment_reference: true,
    },
  });
  if (!order) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const [items, shipment] = await Promise.all([
    prisma.order_items.findMany({
      where: { order_id: orderId },
      select: { product_id: true, sku: true, name: true, quantity: true, unit_price: true, mrp: true, line_total: true, hero_image_path: true },
    }),
    prisma.dtdc_shipments.findFirst({
      where: { order_id: orderId, is_active: true },
      select: { id: true, reference_number: true, status: true, is_active: true, last_error: true, label_last_generated_at: true, created_at: true, updated_at: true },
    }),
  ]);
  let payment = null;
  if (!order.payment_reference) {
    payment = await prisma.payments.findFirst({ where: { order_id: orderId }, orderBy: { created_at: "desc" } });
  }
  return NextResponse.json({ order: jsonSafe(order), items: jsonSafe(items), shipment: jsonSafe(shipment), payment: jsonSafe(payment) });

}
