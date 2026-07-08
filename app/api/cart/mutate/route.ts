import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import * as cart from "@/lib/data/cart";

export const dynamic = "force-dynamic";

// POST /api/cart/mutate  { action: ensure|add|update|remove|merge, ... }
// Mutates the cart directly in MySQL via the TS port of the cart RPCs — MySQL is
// the source of truth. Each mutation recomputes cart totals (see lib/data/cart).
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const action = body?.action;

  try {
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
