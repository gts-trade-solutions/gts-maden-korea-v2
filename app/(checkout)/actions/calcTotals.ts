// app/(checkout)/actions/calcTotals.ts
'use server';

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { REF_COOKIE, PROMO_COOKIE } from "@/lib/referral/constants";
import { effectiveUnitPrice } from "@/lib/pricing";

type CartLine = { product_id: string; qty: number };

export async function calcTotals(lines: CartLine[], shippingFee = 0) {
  const supabase = createClient();

  // 1) Read promo/referral cookies
  const promoCode = cookies().get(PROMO_COOKIE)?.value ?? null;
  const refCode   = cookies().get(REF_COOKIE)?.value ?? null;

  // 2) Resolve discount context (promo wins if valid)
  let promo: { product_id: string | null; discount_percent: number } | null = null;
  if (promoCode) {
    const { data } = await supabase.rpc("validate_promo", { p_code: promoCode });
    if (data && data[0]) {
      promo = { product_id: data[0].product_id, discount_percent: Number(data[0].discount_percent) };
    }
  }

  let ref: { link_type: 'product'|'store'; product_id: string | null; discount_percent: number } | null = null;
  if (!promo && refCode) {
    const { data } = await supabase.rpc("get_referral_context", { p_code: refCode });
    if (data && data[0]) {
      ref = {
        link_type: data[0].link_type,
        product_id: data[0].product_id,
        discount_percent: Number(data[0].discount_percent),
      };
    }
  }

  // 3) Fetch product pricing for the cart
  const ids = lines.map(l => l.product_id);
  const { data: products, error } = await supabase
    .from("products")
    .select("id, price, sale_price, sale_starts_at, sale_ends_at, currency")
    .in("id", ids);
  if (error) throw error;

  const byId = new Map(products.map(p => [p.id, p]));
  const currency = products[0]?.currency ?? "INR";

  // 4) Line computations
  let subtotal = 0;
  let discount_total = 0;

  for (const line of lines) {
    const p = byId.get(line.product_id);
    if (!p) continue;
    const unit = effectiveUnitPrice(p);
    const lineSubtotal = unit * line.qty;
    subtotal += lineSubtotal;

    // Eligible discount percent (promo first, else referral)
    let percent = 0;
    if (promo) {
      // If promo is product-scoped, only discount matching products; if null → site-wide
      const matches = !promo.product_id || promo.product_id === line.product_id;
      percent = matches ? promo.discount_percent : 0;
    } else if (ref) {
      const matches =
        (ref.link_type === "store") ||
        (ref.link_type === "product" && ref.product_id === line.product_id);
      percent = matches ? ref.discount_percent : 0;
    }

    discount_total += +(lineSubtotal * (percent / 100)).toFixed(2);
  }

  const total = +(subtotal + shippingFee - discount_total).toFixed(2);

  return {
    currency,
    subtotal: +subtotal.toFixed(2),
    shipping_fee: +(+shippingFee).toFixed(2),
    discount_total,
    total,
    applied: promo
      ? { type: "promo", code: promoCode, ...promo }
      : ref
      ? { type: "referral", code: refCode, ...ref }
      : null,
  };
}
