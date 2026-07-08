import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

// Money DB layer. The order lifecycle that razorpay/create + verify drive
// (read/update order, attribution, promo lookup, payment record, item/weight/FX
// reads) runs on MySQL via Prisma. `moneyOnMysql` is retained as an exported
// flag helper for callers that still branch on it.
export const moneyOnMysql = () => process.env.MONEY_BACKEND === "mysql";

const num = (v: any) => (v == null ? 0 : Number(v));

export type PaymentOrder = {
  id: string; user_id: string;
  subtotal: number; shipping_fee: number; discount_total: number; total: number;
  currency: string; status: string;
};

export async function getOrderForPayment(orderId: string): Promise<PaymentOrder | null> {
  const o = await prisma.orders.findUnique({
    where: { id: orderId },
    select: { id: true, user_id: true, subtotal: true, shipping_fee: true, discount_total: true, total: true, currency: true, status: true },
  });
  if (!o) return null;
  return { id: o.id, user_id: o.user_id as string, subtotal: num(o.subtotal), shipping_fee: num(o.shipping_fee), discount_total: num(o.discount_total), total: num(o.total), currency: (o.currency as string) ?? "INR", status: o.status as string };
}

// The caller's update object maps directly to columns (numbers for Decimal,
// string for status, object for Json).
export async function updateOrderRow(orderId: string, fields: Record<string, any>): Promise<void> {
  await prisma.orders.update({ where: { id: orderId }, data: fields });
}

export async function upsertOrderAttribution(record: Record<string, any>): Promise<void> {
  // order_attributions PK is order_id (one attribution per order).
  await prisma.order_attributions.upsert({
    where: { order_id: record.order_id },
    update: record as any,
    create: record as any,
  });
}

export async function insertPaymentOrder(record: Record<string, any>): Promise<void> {
  await prisma.payment_orders.create({ data: { id: randomUUID(), ...record } as any });
}

export async function getOrderItemsBasic(orderId: string): Promise<Array<{ product_id: string | null; quantity: number }>> {
  const rows = await prisma.order_items.findMany({ where: { order_id: orderId }, select: { product_id: true, quantity: true } });
  return rows.map((r) => ({ product_id: r.product_id, quantity: r.quantity }));
}

export async function getProductWeights(productIds: string[]): Promise<Map<string, number | null>> {
  if (!productIds.length) return new Map();
  const rows = await prisma.products.findMany({ where: { id: { in: productIds } }, select: { id: true, gross_weight_g: true } });
  return new Map(rows.map((r) => [r.id, r.gross_weight_g == null ? null : Number(r.gross_weight_g)]));
}

export async function getCurrencyRate(code: string): Promise<number | null> {
  const r = await prisma.currency_rates.findFirst({ where: { code, active: true }, select: { rate_from_inr: true } });
  return r?.rate_from_inr == null ? null : Number(r.rate_from_inr);
}

// Promo lookup for attribution (matches the create route's select).
export async function getPromoForAttribution(code: string): Promise<any | null> {
  return prisma.promo_codes.findFirst({
    where: { code, active: true },
    select: { id: true, influencer_id: true, discount_percent: true, commission_percent: true, active: true, starts_at: true, expires_at: true },
  });
}
