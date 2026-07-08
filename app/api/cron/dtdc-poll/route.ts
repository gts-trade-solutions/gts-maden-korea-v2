import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { pollSingleShipment } from "@/lib/dtdc/poller";
import { notifyTransition } from "@/lib/dtdc/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Poll loop touches DTDC tracking + DB + email. Give it room.
export const maxDuration = 60;

const POLL_BATCH_SIZE = 25;
const STALE_AFTER_MINUTES = 20;

/**
 * Cron entry point. Schedule from any external scheduler (every 30 min),
 * e.g. Netlify Scheduled Functions or a cron job:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://madenkorea.com/api/cron/dtdc-poll
 *
 * Set `CRON_SECRET` in the app env. Use the same value above.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const authz = req.headers.get("authorization") || "";
  if (authz !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000);

  // Pick active shipments that haven't been polled recently and aren't
  // in a terminal state. In MySQL, ASC ordering places NULLs first, which
  // preserves the old nullsFirst behavior for last_polled_at.
  let shipments: {
    id: string;
    order_id: string;
    reference_number: string | null;
    status: string;
    last_polled_at: Date | null;
  }[];
  try {
    shipments = await prisma.dtdc_shipments.findMany({
      where: {
        is_active: true,
        status: { notIn: ["delivered", "cancelled", "rto"] },
        OR: [{ last_polled_at: null }, { last_polled_at: { lt: cutoff } }],
      },
      select: {
        id: true,
        order_id: true,
        reference_number: true,
        status: true,
        last_polled_at: true,
      },
      orderBy: { last_polled_at: "asc" },
      take: POLL_BATCH_SIZE,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "query_failed" },
      { status: 500 }
    );
  }

  const results: any[] = [];
  for (const s of shipments ?? []) {
    try {
      const r = await pollSingleShipment(prisma as any, {
        id: s.id,
        order_id: s.order_id,
        reference_number: s.reference_number,
        status: s.status,
      });
      results.push(r);

      if (r.transitioned) {
        const notif = await notifyTransition(prisma as any, {
          order_id: r.order_id,
          awb: r.reference_number,
          prev_status: r.prev_status,
          new_status: r.new_status,
        });
        results[results.length - 1] = { ...results[results.length - 1], notif };
      }
    } catch (e: any) {
      results.push({
        shipment_id: s.id,
        order_id: s.order_id,
        error: e?.message || "loop_failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    polled: results.length,
    results,
  });
}
