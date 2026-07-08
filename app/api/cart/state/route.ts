import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getCartMysql } from "@/lib/data/cart";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/cart/state -> { cart, items } for the signed-in user (MySQL).
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ cart: null, items: [] });

  const { cart, items } = await getCartMysql(userId);
  return NextResponse.json({ cart: jsonSafe(cart), items: jsonSafe(items) });
}
