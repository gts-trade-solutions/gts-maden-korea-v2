import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRouteUser } from "@/lib/auth/routeUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const userId = (await getRouteUser(req))?.id;
    if (!userId) return NextResponse.json({ ok: true }); // nothing to clear

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Clear the Supabase cart (RPC if present, else table-delete fallbacks).
    let rpcError: unknown = null;
    try {
      const { error } = await admin.rpc("clear_my_cart", { p_user_id: userId });
      rpcError = error;
    } catch (error) {
      rpcError = error;
    }
    if (rpcError) {
      const try1 = await admin.from("cart_items").delete().eq("user_id", userId);
      if (try1.error) {
        await admin.from("cart_lines").delete().eq("user_id", userId);
      }
    }

    // Dual-write: clear the MySQL cart too — account/cart pages read the cart from
    // MySQL (CATALOG_BACKEND=mysql), so a Supabase-only clear leaves a stale cart.
    try {
      const { clearCartMysql } = await import("@/lib/data/cart");
      await clearCartMysql(userId);
    } catch (e) {
      console.error("[dual-write] cart clear MySQL failed:", e);
    }

    return NextResponse.json({ ok: true }); // don't fail the UX
  } catch {
    return NextResponse.json({ ok: true });
  }
}
