import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { recalcCartTotalsMysql } from "@/lib/data/cart";
import { effectivePriceForCountry, fetchCountryOffers } from "@/lib/pricing";
import { roundMoney } from "@/lib/currency";

// Reprice a user's cart_items to the CURRENT effective price before an order
// is built from it. `create_order_from_cart` snapshots cart_items.line_total
// verbatim; if a product's price/sale/country-offer changed after add-to-cart,
// that snapshot drifts from the total `calc-totals` shows the customer on the
// checkout page — so the order (and the Razorpay charge, which reads the order
// row) can differ from the displayed total. This refreshes unit_price/line_total
// using the SAME resolver calc-totals uses, so the order == the displayed total.
//
// Runs against Supabase via the service-role admin client (writes the
// authoritative cart that create_order_from_cart reads), scoped to the user's
// own cart. Best-effort: on any failure the caller proceeds with the snapshot
// (today's behavior), so this can never block a checkout.
export async function repriceCartToLive(
  userId: string,
  country: string
): Promise<{ changed: number }> {
  const { createAdminClient } = await import("@/lib/supabaseAdmin");
  const admin = createAdminClient();

  const { data: cart } = await admin
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!cart) return { changed: 0 };

  const { data: items } = await admin
    .from("cart_items")
    .select("id, product_id, quantity, unit_price, line_total")
    .eq("cart_id", cart.id);
  if (!items?.length) return { changed: 0 };

  const productIds = Array.from(new Set(items.map((i: any) => i.product_id)));
  const useMysql = process.env.CATALOG_BACKEND === "mysql";

  // Live price fields + country offers — same source calc-totals reads.
  let products: any[];
  let offers: Record<string, number>;
  if (useMysql) {
    const { getCheckoutProductsMysql } = await import("@/lib/data/checkout");
    const { fetchCountryOffersMysql } = await import("@/lib/data/catalog");
    products = await getCheckoutProductsMysql(productIds);
    offers = await fetchCountryOffersMysql(productIds, country);
  } else {
    const { data } = await admin
      .from("products")
      .select("id, price, sale_price, sale_starts_at, sale_ends_at")
      .in("id", productIds);
    products = data ?? [];
    offers = await fetchCountryOffers(productIds, country, admin);
  }
  const prodMap = new Map(products.map((p: any) => [p.id, p]));

  let changed = 0;
  for (const it of items as any[]) {
    const p = prodMap.get(it.product_id);
    if (!p) continue; // product vanished — leave the snapshot, RPC still copies it
    const unit = roundMoney(effectivePriceForCountry(p, offers));
    const line = roundMoney(unit * Number(it.quantity));
    if (Number(it.unit_price) === unit && Number(it.line_total) === line) continue;
    const { error } = await admin
      .from("cart_items")
      .update({ unit_price: unit, line_total: line })
      .eq("id", it.id);
    if (!error) changed++;
  }
  return { changed };
}

// MySQL twin of repriceCartToLive: refresh the MySQL cart_items to the current
// country-effective price (same resolver calc-totals uses) before the MySQL order
// is built, so the order total matches what the customer saw. Best-effort.
export async function repriceCartToLiveMysql(
  userId: string,
  country: string
): Promise<{ changed: number }> {
  const cart = await prisma.carts.findUnique({ where: { user_id: userId }, select: { id: true } });
  if (!cart) return { changed: 0 };
  const items = await prisma.cart_items.findMany({
    where: { cart_id: cart.id },
    select: { id: true, product_id: true, quantity: true, unit_price: true, line_total: true },
  });
  if (!items.length) return { changed: 0 };

  const productIds = Array.from(new Set(items.map((i) => i.product_id).filter(Boolean) as string[]));
  const { getCheckoutProductsMysql } = await import("@/lib/data/checkout");
  const { fetchCountryOffersMysql } = await import("@/lib/data/catalog");
  const products = await getCheckoutProductsMysql(productIds);
  const offers = await fetchCountryOffersMysql(productIds, country);
  const prodMap = new Map((products as any[]).map((p) => [p.id, p]));

  let changed = 0;
  for (const it of items) {
    const p = it.product_id ? prodMap.get(it.product_id) : null;
    if (!p) continue;
    const unit = roundMoney(effectivePriceForCountry(p, offers));
    const line = roundMoney(unit * Number(it.quantity));
    if (Number(it.unit_price) === unit && Number(it.line_total) === line) continue;
    await prisma.cart_items.update({ where: { id: it.id }, data: { unit_price: unit, line_total: line } });
    changed++;
  }
  await recalcCartTotalsMysql(cart.id);
  return { changed };
}

// Mirror a Supabase order (+ its items) into MySQL verbatim — same id,
// order_number, totals. Supabase stays authoritative for order writes during
// the transition (it runs the order triggers); this keeps the MySQL copy that
// the account pages read in sync. Call after any Supabase order mutation.
const ORDER_FIELDS =
  "id, user_id, order_number, status, currency, subtotal, shipping_fee, discount_total, total, " +
  "shipping_address_id, address_snapshot, notes, promo_code_id, promo_snapshot, payment_provider, " +
  "payment_reference, payment_meta, paid_at, fx_rate_snapshot, subtotal_inr, shipping_fee_inr, " +
  "discount_total_inr, total_inr, recipient_locale, created_at, updated_at";

export async function mirrorOrderIntoMysql(sb: any, orderId: string): Promise<void> {
  const { data: o } = await sb.from("orders").select(ORDER_FIELDS).eq("id", orderId).maybeSingle();
  if (!o) return;

  const data: any = {
    id: o.id,
    user_id: o.user_id,
    order_number: o.order_number ?? null,
    status: o.status,
    currency: o.currency ?? "INR",
    subtotal: o.subtotal ?? 0,
    shipping_fee: o.shipping_fee ?? 0,
    discount_total: o.discount_total ?? 0,
    total: o.total ?? 0,
    shipping_address_id: o.shipping_address_id ?? null,
    address_snapshot: o.address_snapshot ?? null,
    notes: o.notes ?? null,
    promo_code_id: o.promo_code_id ?? null,
    promo_snapshot: o.promo_snapshot ?? {},
    payment_provider: o.payment_provider ?? null,
    payment_reference: o.payment_reference ?? null,
    payment_meta: o.payment_meta ?? null,
    paid_at: o.paid_at ? new Date(o.paid_at) : null,
    fx_rate_snapshot: o.fx_rate_snapshot ?? null,
    subtotal_inr: o.subtotal_inr ?? null,
    shipping_fee_inr: o.shipping_fee_inr ?? null,
    discount_total_inr: o.discount_total_inr ?? null,
    total_inr: o.total_inr ?? null,
    recipient_locale: o.recipient_locale ?? null,
    ...(o.created_at ? { created_at: new Date(o.created_at) } : {}),
  };
  await prisma.orders.upsert({ where: { id: o.id }, update: data, create: data });

  const { data: items } = await sb
    .from("order_items")
    .select("id, order_id, product_id, sku, name, hero_image_path, unit_price, mrp, quantity, line_total, created_at")
    .eq("order_id", orderId);
  await prisma.order_items.deleteMany({ where: { order_id: orderId } });
  if (items?.length) {
    await prisma.order_items.createMany({
      data: items.map((it: any) => ({
        id: it.id,
        order_id: it.order_id,
        product_id: it.product_id ?? null,
        sku: it.sku ?? null,
        name: it.name,
        hero_image_path: it.hero_image_path ?? null,
        unit_price: it.unit_price,
        mrp: it.mrp ?? null,
        quantity: it.quantity,
        line_total: it.line_total,
        ...(it.created_at ? { created_at: new Date(it.created_at) } : {}),
      })),
    });
  }
}

// TypeScript port of create_order_from_cart: build a pending_payment order from
// the user's MySQL cart (recalc totals first, then snapshot the items). MySQL is
// the order's source of truth under Phase 2; the caller mirrors it to Supabase
// during the transition. Throws if the cart is missing/empty (matches the RPC).
export async function createOrderFromCartMysql(
  userId: string,
  address: any | null,
  notes: string | null
): Promise<{
  order_id: string; order_number: string; currency: string;
  subtotal: number; shipping_fee: number; discount_total: number; total: number;
}> {
  const cart = await prisma.carts.findUnique({ where: { user_id: userId }, select: { id: true } });
  if (!cart) throw new Error("Cart not found");
  const items = await prisma.cart_items.findMany({
    where: { cart_id: cart.id },
    select: { product_id: true, sku: true, name: true, hero_image_path: true, unit_price: true, mrp: true, quantity: true, line_total: true },
  });
  if (!items.length) throw new Error("Cart is empty");

  // make sure totals are fresh (matches the RPC's recalculate_cart_totals call)
  await recalcCartTotalsMysql(cart.id);
  const c = await prisma.carts.findUnique({
    where: { id: cart.id },
    select: { currency: true, subtotal: true, shipping_fee_estimate: true, discount_total: true, total_estimate: true },
  });

  const orderId = randomUUID();
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const orderNumber = `MIK${ymd}-${randomUUID().slice(0, 8)}`;

  await prisma.$transaction(async (tx) => {
    await tx.orders.create({
      data: {
        id: orderId,
        user_id: userId,
        status: "pending_payment",
        currency: "INR",
        subtotal: c!.subtotal ?? 0,
        shipping_fee: c!.shipping_fee_estimate ?? 0,
        discount_total: c!.discount_total ?? 0,
        total: c!.total_estimate ?? 0,
        address_snapshot: address ?? undefined,
        notes: notes ?? null,
        order_number: orderNumber,
      },
    });
    await tx.order_items.createMany({
      data: items.map((ci) => ({
        id: randomUUID(),
        order_id: orderId,
        product_id: ci.product_id ?? null,
        sku: ci.sku ?? null,
        name: ci.name,
        hero_image_path: ci.hero_image_path ?? null,
        unit_price: ci.unit_price,
        mrp: ci.mrp ?? null,
        quantity: ci.quantity,
        line_total: ci.line_total,
      })),
    });
  });

  return {
    order_id: orderId,
    order_number: orderNumber,
    currency: c!.currency ?? "INR",
    subtotal: Number(c!.subtotal ?? 0),
    shipping_fee: Number(c!.shipping_fee_estimate ?? 0),
    discount_total: Number(c!.discount_total ?? 0),
    total: Number(c!.total_estimate ?? 0),
  };
}
