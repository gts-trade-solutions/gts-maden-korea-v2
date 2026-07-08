export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin orders LIST (MySQL/Prisma). Admin-gated.
//
// Reproduces the page's exact reads: a page of `orders` (with count,
// stable ordering, and the same status/search filtering), then per-order
// item counts, latest payment method, and the active DTDC AWB/status. The
// returned `rows` are the fully enriched AdminOrderRow shape the table
// renders, plus `totalCount` for pagination.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const PAGE_SIZE = 20;

// address_snapshot can be JSON OR a stringified JSON.
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

  try {
    // Base filter: status/search narrowing. "Awaiting shipment" narrows to paid
    // orders; final "no active shipment" filtering happens after we fetch the
    // dtdc_shipments rows below. Search is limited to order_number (matches the
    // page); the page also does client-side name/email filtering on top.
    const where: any = {};
    if (filterMode === "awaiting_shipment") where.status = "paid";
    if (search) where.order_number = { contains: search };

    // Page of orders (with count + stable ordering + pagination).
    const [ordersData, totalCount] = await Promise.all([
      prisma.orders.findMany({
        where,
        select: {
          id: true,
          order_number: true,
          status: true,
          total: true,
          currency: true,
          created_at: true,
          address_snapshot: true,
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: from,
        take: PAGE_SIZE,
      }),
      prisma.orders.count({ where }),
    ]);

    const rawOrders = ordersData || [];

    if (rawOrders.length === 0) {
      return json({ ok: true, rows: [], totalCount });
    }

    const orderIds = rawOrders.map((o: any) => o.id);

    // Item count (current page only).
    const itemsData = await prisma.order_items.findMany({
      where: { order_id: { in: orderIds } },
      select: { order_id: true, quantity: true },
    });

    const itemCountMap = new Map<string, number>();
    (itemsData || []).forEach((row: any) => {
      const key = row.order_id;
      const qty = Number(row.quantity || 0);
      itemCountMap.set(key, (itemCountMap.get(key) || 0) + qty);
    });

    // Latest payment method (current page only).
    const paymentsData = await prisma.payments.findMany({
      where: { order_id: { in: orderIds } },
      select: { order_id: true, method: true, created_at: true },
    });

    const paymentMap = new Map<string, { method: string; created_at: Date }>();
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
    const shipmentsData = await prisma.dtdc_shipments.findMany({
      where: { order_id: { in: orderIds }, is_active: true },
      select: { order_id: true, reference_number: true, status: true, is_active: true },
    });

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

    return json({ ok: true, rows: jsonSafe(rows), totalCount });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
