import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

// TypeScript port of the Supabase cart RPCs + triggers, operating on MySQL.
// Exact mirror of: get_effective_price, cart_items_bi/bu (unit_price/line_total),
// recalculate_cart_totals (store_settings + K-Plus aware), ensure_cart,
// add_to_cart, update_cart_item, remove_cart_item, merge_cart.

// get_effective_price: sale_price within window, else price.
function effectiveUnitPrice(p: {
  price: any; sale_price: any; sale_starts_at: Date | null; sale_ends_at: Date | null;
}): number {
  const now = Date.now();
  const within =
    p.sale_price != null &&
    (!p.sale_starts_at || new Date(p.sale_starts_at).getTime() <= now) &&
    (!p.sale_ends_at || new Date(p.sale_ends_at).getTime() >= now);
  return within ? Number(p.sale_price) : Number(p.price ?? 0);
}

export async function ensureCartMysql(userId: string): Promise<string> {
  const existing = await prisma.carts.findUnique({ where: { user_id: userId }, select: { id: true } });
  if (existing) return existing.id;
  const id = randomUUID();
  await prisma.carts.create({ data: { id, user_id: userId } });
  return id;
}

// recalculate_cart_totals: subtotal = Σ line_total; shipping from store_settings
// (free for K-Plus members or above threshold); total = max(0, sub+ship-disc).
export async function recalcCartTotalsMysql(cartId: string): Promise<void> {
  const items = await prisma.cart_items.findMany({ where: { cart_id: cartId }, select: { line_total: true } });
  const sub = items.reduce((s, i) => s + Number(i.line_total ?? 0), 0);

  const settings = await prisma.store_settings.findUnique({
    where: { id: 1 }, select: { delivery_threshold: true, default_shipping_fee: true },
  });
  const threshold = settings?.delivery_threshold ?? 2000;
  const fee = settings?.default_shipping_fee ?? 149;

  const cart = await prisma.carts.findUnique({ where: { id: cartId }, select: { user_id: true, discount_total: true } });
  let hasKplus = false;
  if (cart?.user_id) {
    const m = await prisma.user_memberships.findFirst({
      where: { user_id: cart.user_id, status: "active", ends_at: { gt: new Date() } },
      select: { id: true },
    });
    hasKplus = !!m;
  }
  const ship = hasKplus ? 0 : sub < threshold ? fee : 0;
  const disc = Number(cart?.discount_total ?? 0);
  const total = Math.max(0, sub + ship - disc);

  await prisma.carts.update({
    where: { id: cartId },
    data: { subtotal: sub, shipping_fee_estimate: ship, total_estimate: total },
  });
}

export async function addToCartMysql(userId: string, productId: string, qty: number): Promise<string> {
  const q = Math.max(1, !qty ? 1 : qty);
  const cartId = await ensureCartMysql(userId);

  const existing = await prisma.cart_items.findUnique({
    where: { cart_id_product_id: { cart_id: cartId, product_id: productId } },
    select: { id: true, quantity: true, unit_price: true },
  });

  if (existing) {
    // matches add_to_cart's "quantity += qty" (unit_price unchanged; line_total recomputed)
    const newQty = existing.quantity + q;
    await prisma.cart_items.update({
      where: { id: existing.id },
      data: { quantity: newQty, line_total: Number(existing.unit_price) * Math.max(1, newQty) },
    });
  } else {
    const prod = await prisma.products.findUnique({
      where: { id: productId },
      select: { price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true, compare_at_price: true, sku: true, name: true, hero_image_path: true },
    });
    if (!prod) throw new Error("PRODUCT_NOT_FOUND");
    const unitPrice = effectiveUnitPrice(prod);
    await prisma.cart_items.create({
      data: {
        id: randomUUID(), cart_id: cartId, product_id: productId, quantity: q,
        unit_price: unitPrice, mrp: prod.compare_at_price ?? null, sku: prod.sku ?? null,
        name: prod.name, hero_image_path: prod.hero_image_path ?? null, line_total: unitPrice * q,
      },
    });
  }
  await recalcCartTotalsMysql(cartId);
  return cartId;
}

export async function updateCartItemMysql(userId: string, itemId: string, qty: number): Promise<void> {
  const item = await prisma.cart_items.findUnique({
    where: { id: itemId }, select: { id: true, cart_id: true, unit_price: true, carts: { select: { user_id: true } } },
  });
  if (!item || item.carts.user_id !== userId) throw new Error("ITEM_NOT_FOUND");
  if ((qty ?? 0) <= 0) {
    await prisma.cart_items.delete({ where: { id: itemId } });
  } else {
    await prisma.cart_items.update({ where: { id: itemId }, data: { quantity: qty, line_total: Number(item.unit_price) * Math.max(1, qty) } });
  }
  await recalcCartTotalsMysql(item.cart_id);
}

export async function removeCartItemMysql(userId: string, itemId: string): Promise<void> {
  const item = await prisma.cart_items.findUnique({
    where: { id: itemId }, select: { cart_id: true, carts: { select: { user_id: true } } },
  });
  if (!item || item.carts.user_id !== userId) throw new Error("ITEM_NOT_FOUND");
  await prisma.cart_items.delete({ where: { id: itemId } });
  await recalcCartTotalsMysql(item.cart_id);
}

export async function mergeCartMysql(userId: string, items: Array<{ product_id: string; quantity: number }>): Promise<void> {
  if (!Array.isArray(items) || !items.length) return;
  for (const it of items) {
    if (!it?.product_id) continue;
    await addToCartMysql(userId, it.product_id, Math.max(1, it.quantity || 1));
  }
}

// Cart + line items (with product) for display. Mirrors cartClient.fetchCart /
// fetchCartItems shape (item.product join).
export async function getCartMysql(userId: string) {
  const cart = await prisma.carts.findUnique({
    where: { user_id: userId },
    select: { id: true, currency: true, subtotal: true, shipping_fee_estimate: true, discount_total: true, total_estimate: true },
  });
  if (!cart) return { cart: null, items: [] as any[] };
  const rows = await prisma.cart_items.findMany({
    where: { cart_id: cart.id },
    orderBy: { created_at: "asc" },
    select: {
      id: true, quantity: true, unit_price: true, line_total: true, product_id: true,
      products: {
        select: {
          id: true, slug: true, name: true, price: true, currency: true, is_published: true,
          compare_at_price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true,
          hero_image_path: true, brands: { select: { name: true } },
        },
      },
    },
  });
  const items = rows.map(({ products, ...rest }) => ({ ...rest, product: products }));
  return { cart, items };
}

// Mirror of cart_clear_for_user: empty the user's MySQL cart + zero totals.
// Called after razorpay/verify clears the authoritative Supabase cart, so the
// MySQL cart the storefront reads (badge, cart page) empties on payment too.
export async function clearCartMysql(userId: string): Promise<void> {
  const cart = await prisma.carts.findUnique({ where: { user_id: userId }, select: { id: true } });
  if (!cart) return;
  await prisma.cart_items.deleteMany({ where: { cart_id: cart.id } });
  await prisma.carts.update({
    where: { id: cart.id },
    data: { subtotal: 0, shipping_fee_estimate: 0, discount_total: 0, total_estimate: 0 },
  });
}

// Dual-write mirror: copy the authoritative Supabase cart (after its RPC ran the
// real triggers) into MySQL verbatim — same ids + totals, so reads from MySQL
// match Supabase exactly and update/remove ids stay valid across both. Used
// during the transition; replaced by the service functions above at Phase E.
export async function mirrorCartIntoMysql(
  cart: { id: string; user_id: string; currency?: string | null; subtotal: any; shipping_fee_estimate: any; discount_total: any; total_estimate: any },
  items: Array<{ id: string; cart_id: string; product_id: string; sku: string | null; name: string; hero_image_path: string | null; unit_price: any; mrp: any; quantity: number; line_total: any; created_at?: string | null }>
): Promise<void> {
  // Drop any stale cart this user has under a different id (rare: cart deleted+recreated in Supabase).
  await prisma.carts.deleteMany({ where: { user_id: cart.user_id, id: { not: cart.id } } });
  await prisma.carts.upsert({
    where: { id: cart.id },
    update: {
      currency: cart.currency ?? "INR",
      subtotal: cart.subtotal ?? 0, shipping_fee_estimate: cart.shipping_fee_estimate ?? 0,
      discount_total: cart.discount_total ?? 0, total_estimate: cart.total_estimate ?? 0,
    },
    create: {
      id: cart.id, user_id: cart.user_id, currency: cart.currency ?? "INR",
      subtotal: cart.subtotal ?? 0, shipping_fee_estimate: cart.shipping_fee_estimate ?? 0,
      discount_total: cart.discount_total ?? 0, total_estimate: cart.total_estimate ?? 0,
    },
  });
  await prisma.cart_items.deleteMany({ where: { cart_id: cart.id } });
  if (items.length) {
    await prisma.cart_items.createMany({
      data: items.map((it) => ({
        id: it.id, cart_id: it.cart_id, product_id: it.product_id,
        sku: it.sku ?? null, name: it.name, hero_image_path: it.hero_image_path ?? null,
        unit_price: it.unit_price ?? 0, mrp: it.mrp ?? null, quantity: it.quantity,
        line_total: it.line_total ?? 0, ...(it.created_at ? { created_at: new Date(it.created_at) } : {}),
      })),
    });
  }
}

