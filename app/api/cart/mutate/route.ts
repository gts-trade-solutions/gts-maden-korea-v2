import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

// POST /api/cart/mutate  { action: ensure|add|update|remove|merge, ... }
// Dual-write: run the authoritative Supabase RPC (real triggers + ids), then
// mirror the resulting cart into MySQL. Keeps both DBs identical so checkout
// (still on Supabase) and MySQL reads agree.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const action = body?.action;

  // MySQL money path (MONEY_BACKEND=mysql): mutate the cart directly in MySQL via
  // the TS port of the cart RPCs — MySQL is the source of truth, no Supabase write
  // or mirror needed. The default path below stays on the Supabase RPCs.
  if (process.env.MONEY_BACKEND === "mysql") {
    try {
      const cart = await import("@/lib/data/cart");
      let cartId: string | undefined;
      if (action === "ensure") cartId = await cart.ensureCartMysql(userId);
      else if (action === "add") cartId = await cart.addToCartMysql(userId, body.product_id, body.qty ?? 1);
      else if (action === "update") await cart.updateCartItemMysql(userId, body.item_id, body.qty);
      else if (action === "remove") await cart.removeCartItemMysql(userId, body.item_id);
      else if (action === "merge") await cart.mergeCartMysql(userId, body.items ?? []);
      else return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
      return NextResponse.json({ ok: true, cartId });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "CART_WRITE_FAILED" }, { status: 500 });
    }
  }

  const { supabaseForUser, rpcForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);

  // 1) Authoritative Supabase mutation. rpcForUser routes to the auth.uid()-based
  // RPC (Supabase) or its `_as(p_user_id,…)` wrapper (NextAuth) so the right user
  // is used under either backend.
  try {
    if (action === "ensure") {
      const { error } = await rpcForUser(sb, userId, "ensure_cart");
      if (error) throw error;
    } else if (action === "add") {
      const { error } = await rpcForUser(sb, userId, "add_to_cart", { p_product_id: body.product_id, p_qty: body.qty ?? 1 });
      if (error) throw error;
    } else if (action === "update") {
      const { error } = await rpcForUser(sb, userId, "update_cart_item", { p_item_id: body.item_id, p_qty: body.qty });
      if (error) throw error;
    } else if (action === "remove") {
      const { error } = await rpcForUser(sb, userId, "remove_cart_item", { p_item_id: body.item_id });
      if (error) throw error;
    } else if (action === "merge") {
      const { error } = await rpcForUser(sb, userId, "merge_cart", { p_items: body.items ?? [] });
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "BAD_ACTION" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "CART_WRITE_FAILED" }, { status: 500 });
  }

  // 2) Mirror the authoritative cart into MySQL (best-effort)
  let cartId: string | undefined;
  try {
    const { data: cart } = await sb
      .from("carts")
      .select("id, user_id, currency, subtotal, shipping_fee_estimate, discount_total, total_estimate")
      .eq("user_id", userId).maybeSingle();
    if (cart) {
      cartId = cart.id;
      const { data: items } = await sb
        .from("cart_items")
        .select("id, cart_id, product_id, sku, name, hero_image_path, unit_price, mrp, quantity, line_total, created_at")
        .eq("cart_id", cart.id);
      const { mirrorCartIntoMysql } = await import("@/lib/data/cart");
      await mirrorCartIntoMysql(cart as any, (items ?? []) as any);
    }
  } catch (e) {
    console.error(`[dual-write] cart ${action} MySQL mirror failed:`, e);
  }

  return NextResponse.json({ ok: true, cartId });
}
