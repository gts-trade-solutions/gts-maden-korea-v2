import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { pollSingleShipment } from "@/lib/dtdc/poller";
import { notifyTransition } from "@/lib/dtdc/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Poll loop touches DTDC tracking + Supabase + email. Give it room.
export const maxDuration = 60;

const POLL_BATCH_SIZE = 25;
const STALE_AFTER_MINUTES = 20;

/**
 * Cron entry point. Schedule via Supabase pg_cron (every 30 min):
 *
 *   select cron.schedule(
 *     'dtdc-poll',
 *     '*\/30 * * * *',
 *     $$ select net.http_post(
 *          url := 'https://<your-app>/api/cron/dtdc-poll',
 *          headers := jsonb_build_object(
 *            'Content-Type', 'application/json',
 *            'Authorization', 'Bearer <CRON_SECRET>'
 *          ),
 *          body := '{}'::jsonb
 *        ); $$
 *   );
 *
 * Set `CRON_SECRET` in Netlify env. Use the same value above.
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

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000).toISOString();

  // Pick active shipments that haven't been polled recently and aren't
  // in a terminal state. The partial index supports this query.
  const { data: shipments, error } = await admin
    .from("dtdc_shipments")
    .select("id, order_id, reference_number, status, last_polled_at")
    .eq("is_active", true)
    .not("status", "in", "(delivered,cancelled,rto)")
    .or(`last_polled_at.is.null,last_polled_at.lt.${cutoff}`)
    .order("last_polled_at", { ascending: true, nullsFirst: true })
    .limit(POLL_BATCH_SIZE);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const results: any[] = [];
  for (const s of shipments ?? []) {
    try {
      const r = await pollSingleShipment(admin as any, {
        id: s.id,
        order_id: s.order_id,
        reference_number: s.reference_number,
        status: s.status,
      });
      results.push(r);

      if (r.transitioned) {
        const notif = await notifyTransition(admin as any, {
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
