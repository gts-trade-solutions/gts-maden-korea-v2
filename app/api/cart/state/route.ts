import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/cart/state -> { cart, items } for the signed-in user.
// MySQL behind the flag (mirrored from Supabase), Supabase fallback.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ cart: null, items: [] });

  if (process.env.CATALOG_BACKEND === "mysql") {
    const { getCartMysql } = await import("@/lib/data/cart");
    const { cart, items } = await getCartMysql(userId);
    return NextResponse.json({ cart: jsonSafe(cart), items: jsonSafe(items) });
  }

  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { data: cart } = await sb.from("carts").select("*").eq("user_id", userId).maybeSingle();
  if (!cart) return NextResponse.json({ cart: null, items: [] });
  const { data: items } = await sb
    .from("cart_items")
    .select(`id, quantity, unit_price, line_total, product_id,
      product:products ( id, slug, name, price, currency, is_published, compare_at_price, sale_price, sale_starts_at, sale_ends_at, hero_image_path, brands ( name ) )`)
    .eq("cart_id", cart.id)
    .order("created_at", { ascending: true });
  return NextResponse.json({ cart, items: items ?? [] });
}
