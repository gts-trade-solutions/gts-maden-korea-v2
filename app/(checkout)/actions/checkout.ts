// app/(checkout)/actions/checkout.ts
'use server';

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { calcTotals } from "./calcTotals";
import { REF_COOKIE, PROMO_COOKIE } from "@/lib/referral/constants";

type CartLine = { product_id: string; qty: number };

export async function checkout({
  userId,
  lines,
  shippingAddressId,
  notes,
  shippingFee = 0,
}: {
  userId: string;
  lines: CartLine[];
  shippingAddressId?: string | null;
  notes?: string | null;
  shippingFee?: number;
}) {
  const supabase = createClient();

  // 1) Calculate totals with referral/promo
  const totals = await calcTotals(lines, shippingFee);

  // 2) Create the order
  const { data: orderIns, error: orderErr } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      status: "paid", // or 'pending_payment' if you capture later
      currency: totals.currency,
      subtotal: totals.subtotal,
      shipping_fee: totals.shipping_fee,
      discount_total: totals.discount_total,
      total: totals.total,
      shipping_address_id: shippingAddressId ?? null,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (orderErr) throw orderErr;

  const orderId = orderIns.id as string;

  // 3) Insert order_items (example schema — replace with your columns)
  //    Pull unit price again (same as calcTotals) to avoid mismatch
  const { data: products } = await supabase
    .from("products")
    .select("id, price, sale_price, sale_starts_at, sale_ends_at")
    .in("id", lines.map(l => l.product_id));

  const byId = new Map(products?.map(p => [p.id, p]));
  const orderItems = lines.map(l => {
    const p = byId.get(l.product_id)!;
    const unit = (p?.sale_price) ?? 0; // keep aligned with effectiveUnitPrice if you have that column too
    return {
      order_id: orderId,
      product_id: l.product_id,
      quantity: l.qty,
      unit_price: unit,
      // add other columns as your schema requires (name snapshot, sku, tax, etc.)
    };
  });

  // Replace 'order_items' with your real table name/columns
  const { error: oiErr } = await supabase.from("order_items").insert(orderItems);
  if (oiErr) throw oiErr;

  // 4) Attribute the order (promo wins)
  const promoCode = cookies().get(PROMO_COOKIE)?.value ?? null;
  const refCode   = cookies().get(REF_COOKIE)?.value ?? null;

  const { error: attrErr } = await supabase.rpc("attribute_order", {
    p_order_id: orderId,
    p_code: refCode ?? null,
    p_promo: promoCode ?? null,
  });
  if (attrErr) throw attrErr;

  // 5) Clear promo cookie if you don’t want it to persist across orders (optional)
  // (Keep referral cookie to respect the attribution window)
  if (promoCode) {
    cookies().set({
      name: PROMO_COOKIE,
      value: "",
      path: "/",
      maxAge: 0,
    });
  }

  return { ok: true, orderId, totals, attribution: totals.applied };
}
