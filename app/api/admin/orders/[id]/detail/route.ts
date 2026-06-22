export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin: RLS-restricted slices of the order detail page. `payments` and
// `dtdc_shipments` both return 0 rows for the browser anon client under
// NextAuth. The `orders`/`order_items` reads are also routed here now so RLS
// can be enabled on those tables (the anon client currently still reads them —
// the leak we're closing). All reads go through the SERVICE-ROLE client.
//
// `?active=1` returns just the active shipment row (for the create-guard);
// otherwise returns { order, items, payment, shipment } mirroring the page's
// load() reads.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const orderId = params.id;
  if (!orderId) return json({ ok: false, error: "MISSING_ID" }, 400);
  const sb = admin();

  // Create-guard check: the single active shipment for this order.
  if (new URL(req.url).searchParams.get("active") === "1") {
    const { data, error: e } = await sb
      .from("dtdc_shipments")
      .select("*")
      .eq("order_id", orderId)
      .eq("is_active", true)
      .maybeSingle();
    if (e) return json({ ok: false, error: e.message }, 500);
    return json({ ok: true, shipment: data ?? null });
  }

  const [
    { data: ord, error: oErr },
    { data: its, error: iErr },
    { data: ship, error: sErr },
    { data: pays, error: pErr },
  ] = await Promise.all([
    sb
      .from("orders")
      .select(
        "id, order_number, status, currency, subtotal, shipping_fee, discount_total, total, subtotal_inr, shipping_fee_inr, discount_total_inr, total_inr, fx_rate_snapshot, address_snapshot, created_at, user_id"
      )
      .eq("id", orderId)
      .maybeSingle(),
    sb
      .from("order_items")
      .select(
        "product_id, sku, name, quantity, unit_price, line_total, mrp, hero_image_path"
      )
      .eq("order_id", orderId),
    sb
      .from("dtdc_shipments")
      .select("id, reference_number, status, is_active, last_error, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1),
    sb
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (oErr) return json({ ok: false, error: oErr.message }, 500);
  if (iErr) return json({ ok: false, error: iErr.message }, 500);
  if (sErr) return json({ ok: false, error: sErr.message }, 500);
  if (pErr) return json({ ok: false, error: pErr.message }, 500);

  return json({
    ok: true,
    order: ord ?? null,
    items: its ?? [],
    shipment: (ship ?? [])[0] ?? null,
    payment: (pays ?? [])[0] ?? null,
  });
}
