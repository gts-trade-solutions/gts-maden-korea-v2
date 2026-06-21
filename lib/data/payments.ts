import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { createClient } from "@supabase/supabase-js";

// Flag-aware money DB layer. When MONEY_BACKEND=mysql the order lifecycle that
// razorpay/create + verify drive (read/update order, attribution, promo lookup,
// payment record, item/weight/FX reads) runs on MySQL via Prisma; otherwise the
// proven Supabase service-role path runs unchanged. This lets the heaviest money
// routes move to MySQL behind the flag without duplicating their pricing/FX
// logic, and keeps the default (flag-off) behavior byte-identical to today.
export const moneyOnMysql = () => process.env.MONEY_BACKEND === "mysql";

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

const num = (v: any) => (v == null ? 0 : Number(v));

export type PaymentOrder = {
  id: string; user_id: string;
  subtotal: number; shipping_fee: number; discount_total: number; total: number;
  currency: string; status: string;
};

export async function getOrderForPayment(orderId: string): Promise<PaymentOrder | null> {
  if (moneyOnMysql()) {
    const o = await prisma.orders.findUnique({
      where: { id: orderId },
      select: { id: true, user_id: true, subtotal: true, shipping_fee: true, discount_total: true, total: true, currency: true, status: true },
    });
    if (!o) return null;
    return { id: o.id, user_id: o.user_id as string, subtotal: num(o.subtotal), shipping_fee: num(o.shipping_fee), discount_total: num(o.discount_total), total: num(o.total), currency: (o.currency as string) ?? "INR", status: o.status as string };
  }
  const { data } = await sb().from("orders").select("id, user_id, subtotal, shipping_fee, discount_total, total, currency, status").eq("id", orderId).maybeSingle();
  return (data as any) ?? null;
}

// Same field/column names on both sides, so the caller's update object works for
// either backend (numbers for Decimal, string for status, object for Json).
export async function updateOrderRow(orderId: string, fields: Record<string, any>): Promise<void> {
  if (moneyOnMysql()) { await prisma.orders.update({ where: { id: orderId }, data: fields }); return; }
  await sb().from("orders").update(fields).eq("id", orderId);
}

export async function upsertOrderAttribution(record: Record<string, any>): Promise<void> {
  if (moneyOnMysql()) {
    // order_attributions PK is order_id (one attribution per order).
    await prisma.order_attributions.upsert({
      where: { order_id: record.order_id },
      update: record as any,
      create: record as any,
    });
    return;
  }
  await sb().from("order_attributions").upsert(record, { onConflict: "order_id" });
}

export async function insertPaymentOrder(record: Record<string, any>): Promise<void> {
  if (moneyOnMysql()) { await prisma.payment_orders.create({ data: { id: randomUUID(), ...record } as any }); return; }
  await sb().from("payment_orders").insert(record);
}

export async function getOrderItemsBasic(orderId: string): Promise<Array<{ product_id: string | null; quantity: number }>> {
  if (moneyOnMysql()) {
    const rows = await prisma.order_items.findMany({ where: { order_id: orderId }, select: { product_id: true, quantity: true } });
    return rows.map((r) => ({ product_id: r.product_id, quantity: r.quantity }));
  }
  const { data } = await sb().from("order_items").select("product_id, quantity").eq("order_id", orderId);
  return (data as any) ?? [];
}

export async function getProductWeights(productIds: string[]): Promise<Map<string, number | null>> {
  if (!productIds.length) return new Map();
  if (moneyOnMysql()) {
    const rows = await prisma.products.findMany({ where: { id: { in: productIds } }, select: { id: true, gross_weight_g: true } });
    return new Map(rows.map((r) => [r.id, r.gross_weight_g == null ? null : Number(r.gross_weight_g)]));
  }
  const { data } = await sb().from("products").select("id, gross_weight_g").in("id", productIds);
  return new Map((data ?? []).map((r: any) => [r.id, r.gross_weight_g]));
}

export async function getCurrencyRate(code: string): Promise<number | null> {
  if (moneyOnMysql()) {
    const r = await prisma.currency_rates.findFirst({ where: { code, active: true }, select: { rate_from_inr: true } });
    return r?.rate_from_inr == null ? null : Number(r.rate_from_inr);
  }
  const { data } = await sb().from("currency_rates").select("rate_from_inr, active").eq("code", code).eq("active", true).maybeSingle();
  return data?.rate_from_inr == null ? null : Number(data.rate_from_inr);
}

// Promo lookup for attribution (matches the create route's select).
export async function getPromoForAttribution(code: string): Promise<any | null> {
  if (moneyOnMysql()) {
    return prisma.promo_codes.findFirst({
      where: { code, active: true },
      select: { id: true, influencer_id: true, discount_percent: true, commission_percent: true, active: true, starts_at: true, expires_at: true },
    });
  }
  const { data } = await sb().from("promo_codes").select("id, influencer_id, discount_percent, commission_percent, active, starts_at, expires_at").eq("code", code).eq("active", true).maybeSingle();
  return data ?? null;
}
