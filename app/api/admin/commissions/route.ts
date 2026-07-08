export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin endpoints for managing K-Partnership commission attributions.
//
//   GET  ?status=pending|approved|voided     — list rows, paginated
//   PATCH                                    — flip a single row's status
//                                              body: { order_id, status }
//
// Commission rows are written by /api/razorpay/verify when an order
// completes; this surface lets admins manually approve/void rows when
// the auto-approve cron isn't appropriate (e.g., suspected fraud,
// returning customer, etc.).

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const ALLOWED_STATUSES = ["pending", "approved", "voided"] as const;

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  if (!ALLOWED_STATUSES.includes(status as any)) {
    return json({ ok: false, error: "INVALID_STATUS" }, 400);
  }
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));

  // Pull the attribution rows + a total count for pagination. Order/
  // influencer detail is enriched below with one query each (no FK
  // relation in the schema across these ids). Acceptable — the admin
  // page paginates 100/screen.
  const [rows, count] = await Promise.all([
    prisma.order_attributions.findMany({
      where: { status },
      orderBy: { created_at: "desc" },
      skip: offset,
      take: limit,
      select: {
        order_id: true,
        influencer_id: true,
        commission_amount: true,
        commission_percent: true,
        currency: true,
        status: true,
        created_at: true,
        attributed_by: true,
        promo_code_id: true,
      },
    }),
    prisma.order_attributions.count({ where: { status } }),
  ]);

  // Enrich with order_number + paid_at + influencer handle in one
  // pass each. Small N (page size = 100).
  const orderIds = Array.from(new Set(rows.map((r) => r.order_id)));
  const inflIds = Array.from(new Set(rows.map((r) => r.influencer_id)));

  const [orderRows, inflRows] = await Promise.all([
    prisma.orders.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        order_number: true,
        paid_at: true,
        status: true,
        total_inr: true,
        total: true,
        currency: true,
      },
    }),
    prisma.influencer_profiles.findMany({
      where: { user_id: { in: inflIds } },
      select: { user_id: true, handle: true, display_name: true },
    }),
  ]);

  const orderMap = new Map(orderRows.map((o: any) => [o.id, o]));
  const inflMap = new Map(inflRows.map((i: any) => [i.user_id, i]));

  const enriched = rows.map((r: any) => ({
    ...r,
    order: orderMap.get(r.order_id) ?? null,
    influencer: inflMap.get(r.influencer_id) ?? null,
  }));

  return json({ ok: true, total: count ?? enriched.length, rows: jsonSafe(enriched) });
}

// Flip a single attribution's status. Body: { order_id, status }.
// Used by the admin "approve" / "void" buttons.
export async function PATCH(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const orderId = String(body.order_id || "");
  const status = String(body.status || "");
  if (!orderId) return json({ ok: false, error: "MISSING_ORDER_ID" }, 400);
  if (!ALLOWED_STATUSES.includes(status as any)) {
    return json({ ok: false, error: "INVALID_STATUS" }, 400);
  }

  try {
    await prisma.order_attributions.updateMany({
      where: { order_id: orderId },
      data: { status },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "UPDATE_FAILED" }, 500);
  }

  return json({ ok: true });
}
