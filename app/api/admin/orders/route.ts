export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin orders LIST. Under NextAuth the browser anon client can still read
// `orders`/`order_items` (RLS off — the leak we're closing), and `payments`/
// `dtdc_shipments` are RLS-on (anon gets 0). This routes the whole list
// assembly through the SERVICE-ROLE client so RLS can be enabled on
// `orders`/`order_items` without breaking the admin list page.
//
// It reproduces the page's exact reads: a page of `orders` (with count,
// stable ordering, and the same status/search filtering), then per-order
// item counts, latest payment method, and the active DTDC AWB/status. The
// returned `rows` are the fully enriched AdminOrderRow shape the table
// renders, plus `totalCount` for pagination.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const PAGE_SIZE = 20;

// address_snapshot can be jsonb OR a stringified JSON.
function safeParseSnapshot(v: any): any {
  if (!v) return {};
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return {};
    }
  }
  return {};
}

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const search = (url.searchParams.get("search") || "").trim();
  const filterMode =
    url.searchParams.get("filter") === "awaiting_shipment"
      ? "awaiting_shipment"
      : "all";

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const sb = admin();

  try {
    // Base query with count + stable ordering + pagination.
    let q = sb
      .from("orders")
      .select(
        "id, order_number, status, total, currency, created_at, address_snapshot",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    // "Awaiting shipment" filter narrows to paid orders. Final filtering for
    // "no active shipment" happens after we fetch the dtdc_shipments rows below.
    if (filterMode === "awaiting_shipment") {
      q = q.eq("status", "paid");
    }

    // Server-side search is limited to order_number (matches the page); the
    // page also does client-side name/email filtering on top of this.
    if (search) {
      q = q.ilike("order_number", `%${search}%`);
    }

    const { data: ordersData, error: oErr, count } = await q;
    if (oErr) return json({ ok: false, error: oErr.message }, 500);

    const rawOrders = ordersData || [];
    const totalCount = count ?? 0;

    if (rawOrders.length === 0) {
      return json({ ok: true, rows: [], totalCount });
    }

    const orderIds = rawOrders.map((o: any) => o.id);

    // Item count (current page only).
    const { data: itemsData } = await sb
      .from("order_items")
      .select("order_id, quantity")
      .in("order_id", orderIds);

    const itemCountMap = new Map<string, number>();
    (itemsData || []).forEach((row: any) => {
      const key = row.order_id;
      const qty = Number(row.quantity || 0);
      itemCountMap.set(key, (itemCountMap.get(key) || 0) + qty);
    });

    // Latest payment method (current page only).
    const { data: paymentsData } = await sb
      .from("payments")
      .select("order_id, method, created_at")
      .in("order_id", orderIds);

    const paymentMap = new Map<string, { method: string; created_at: string }>();
    (paymentsData || []).forEach((p: any) => {
      const key = p.order_id;
      const existing = paymentMap.get(key);
      if (!existing) {
        paymentMap.set(key, { method: p.method || "—", created_at: p.created_at });
        return;
      }
      if (new Date(p.created_at).getTime() > new Date(existing.created_at).getTime()) {
        paymentMap.set(key, { method: p.method || "—", created_at: p.created_at });
      }
    });

    // Active DTDC shipments for the current page.
    const { data: shipmentsData } = await sb
      .from("dtdc_shipments")
      .select("order_id, reference_number, status, is_active")
      .in("order_id", orderIds)
      .eq("is_active", true);

    const shipmentMap = new Map<string, { awb: string | null; status: string | null }>();
    (shipmentsData || []).forEach((row: any) => {
      shipmentMap.set(row.order_id, {
        awb: row.reference_number ?? null,
        status: row.status ?? null,
      });
    });

    let rows = rawOrders.map((o: any) => {
      const snap = safeParseSnapshot(o.address_snapshot);
      const ship = shipmentMap.get(o.id);

      return {
        id: o.id,
        order_number: o.order_number ?? null,
        status: o.status,
        total: Number(o.total || 0),
        currency: o.currency ?? "INR",
        created_at: o.created_at,
        customerName: snap?.name || "Guest",
        customerEmail: snap?.email || "—",
        itemCount: itemCountMap.get(o.id) || 0,
        paymentMethod: paymentMap.get(o.id)?.method || "—",
        shipmentAwb: ship?.awb ?? null,
        shipmentStatus: ship?.status ?? null,
      };
    });

    // For the awaiting-shipment filter, drop rows that already have an active
    // shipment. Pagination counts include those rows, but the table reflects
    // only what still needs work — same as the page did.
    if (filterMode === "awaiting_shipment") {
      rows = rows.filter((o) => !o.shipmentAwb);
    }

    return json({ ok: true, rows, totalCount });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
