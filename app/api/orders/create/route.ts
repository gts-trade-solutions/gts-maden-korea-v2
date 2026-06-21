import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUserId } from "@/lib/auth/identity";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

export const dynamic = "force-dynamic";

// POST /api/orders/create  { address, notes }
// Creates the pending order. Supabase `create_order_from_cart` is authoritative
// (runs the order triggers + MIK order number + totals), then we mirror the new
// order + items into MySQL so the account pages (which read orders from MySQL)
// see it. Returns the same shape the checkout hook expected from the RPC.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const address = body?.address ?? null;
  const notes = body?.notes ?? null;

  const rawCountry = cookies().get("mik_country")?.value;
  const country = isSupportedCountry(rawCountry) ? rawCountry : DEFAULT_COUNTRY;

  // MySQL money path (MONEY_BACKEND=mysql): build the pending order from the MySQL
  // cart — MySQL is the source of truth. The default path below stays on Supabase.
  if (process.env.MONEY_BACKEND === "mysql") {
    try {
      const { repriceCartToLiveMysql, createOrderFromCartMysql } = await import("@/lib/data/orders");
      await repriceCartToLiveMysql(userId, country).catch((e) =>
        console.error("[orders/create] mysql reprice failed (using snapshot):", e)
      );
      const info = await createOrderFromCartMysql(userId, address, notes);
      return NextResponse.json({ ok: true, ...info });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || "ORDER_CREATE_FAILED" }, { status: 500 });
    }
  }

  const { supabaseForUser, rpcForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);

  // Reprice the cart to live prices BEFORE the order is built. The RPC
  // snapshots cart_items.line_total verbatim, so without this the order (and
  // the Razorpay charge that reads it) can differ from the calc-totals total
  // the customer saw if a price changed after add-to-cart. Best-effort: on
  // failure we fall through to the snapshot (prior behavior), never blocking.
  try {
    const { repriceCartToLive } = await import("@/lib/data/orders");
    await repriceCartToLive(userId, country);
  } catch (e) {
    console.error("[orders/create] cart reprice failed (using snapshot):", e);
  }

  const { data, error } = await rpcForUser(sb, userId, "create_order_from_cart", { p_address: address, p_notes: notes });
  if (error || !data || !data[0]) {
    return NextResponse.json({ ok: false, error: error?.message || "ORDER_CREATE_FAILED" }, { status: 500 });
  }
  const info = data[0];

  try {
    const { mirrorOrderIntoMysql } = await import("@/lib/data/orders");
    await mirrorOrderIntoMysql(sb, info.order_id);
  } catch (e) {
    console.error("[dual-write] order create MySQL mirror failed:", e);
  }

  return NextResponse.json({
    ok: true,
    order_id: info.order_id,
    order_number: info.order_number,
    currency: info.currency,
    subtotal: info.subtotal,
    shipping_fee: info.shipping_fee,
    discount_total: info.discount_total,
    total: info.total,
  });
}
