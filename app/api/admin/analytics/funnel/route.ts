export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const RANGES: Record<string, string> = {
  "1d": "1 day",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "7d";
  const interval = RANGES[range] || RANGES["7d"];

  const admin = createAdminClient();

  // Per-session funnel: max() per session_id over the time window.
  const sql = `
    with windowed as (
      select session_id, event_name
      from public.events
      where occurred_at > now() - interval '${interval}'
    ),
    per_session as (
      select session_id,
        max(case when event_name = 'page_view'             then 1 else 0 end) as visited,
        max(case when event_name = 'product_view'          then 1 else 0 end) as viewed_product,
        max(case when event_name = 'add_to_cart'           then 1 else 0 end) as added_to_cart,
        max(case when event_name = 'checkout_started'      then 1 else 0 end) as started_checkout,
        max(case when event_name = 'pay_clicked'           then 1 else 0 end) as clicked_pay,
        max(case when event_name = 'payment_modal_opened'  then 1 else 0 end) as opened_modal,
        max(case when event_name = 'order_placed'          then 1 else 0 end) as purchased
      from windowed
      group by session_id
    )
    select
      count(*)                          as total_sessions,
      coalesce(sum(visited),0)          as visited,
      coalesce(sum(viewed_product),0)   as viewed_product,
      coalesce(sum(added_to_cart),0)    as added_to_cart,
      coalesce(sum(started_checkout),0) as started_checkout,
      coalesce(sum(clicked_pay),0)      as clicked_pay,
      coalesce(sum(opened_modal),0)     as opened_modal,
      coalesce(sum(purchased),0)        as purchased
    from per_session;
  `;

  const { data, error: rpcErr } = await admin.rpc("exec_sql_admin", { p_sql: sql }).single();

  // Fall back to executing via a one-off pgsql RPC isn't available here,
  // so use the events table directly via PostgREST aggregate. Simpler:
  // count per event_name, then derive per-session totals client-side
  // for stages we care about. Since there's no built-in for the
  // session-pivot, we run two queries: one for event totals, one for
  // distinct sessions.
  if (rpcErr) {
    const cutoff = new Date(
      Date.now() -
        ({ "1 day": 1, "7 days": 7, "30 days": 30, "90 days": 90 }[interval] ?? 7) *
          24 *
          60 *
          60 *
          1000
    ).toISOString();

    // Pull all events in window — admin-only, so the cost is fine.
    const { data: rows, error: e2 } = await admin
      .from("events")
      .select("session_id, event_name")
      .gte("occurred_at", cutoff);
    if (e2) return json({ ok: false, error: e2.message }, 500);

    const seen: Record<string, Set<string>> = {};
    for (const r of rows || []) {
      const set = seen[r.session_id] || (seen[r.session_id] = new Set());
      set.add(r.event_name);
    }
    const totals = Object.values(seen).reduce(
      (acc, set) => {
        acc.total++;
        if (set.has("page_view")) acc.visited++;
        if (set.has("product_view")) acc.viewed_product++;
        if (set.has("add_to_cart")) acc.added_to_cart++;
        if (set.has("checkout_started")) acc.started_checkout++;
        if (set.has("pay_clicked")) acc.clicked_pay++;
        if (set.has("payment_modal_opened")) acc.opened_modal++;
        if (set.has("order_placed")) acc.purchased++;
        return acc;
      },
      {
        total: 0,
        visited: 0,
        viewed_product: 0,
        added_to_cart: 0,
        started_checkout: 0,
        clicked_pay: 0,
        opened_modal: 0,
        purchased: 0,
      }
    );

    return json({
      ok: true,
      range,
      stages: [
        { key: "visited", label: "Visited site", count: totals.visited },
        { key: "viewed_product", label: "Viewed a product", count: totals.viewed_product },
        { key: "added_to_cart", label: "Added to cart", count: totals.added_to_cart },
        { key: "started_checkout", label: "Started checkout", count: totals.started_checkout },
        { key: "clicked_pay", label: "Clicked Pay", count: totals.clicked_pay },
        { key: "opened_modal", label: "Opened Razorpay", count: totals.opened_modal },
        { key: "purchased", label: "Purchased", count: totals.purchased },
      ],
      total_sessions: totals.total,
    });
  }

  // If exec_sql_admin existed, use the result. (Kept for forward-compat.)
  const r = data as any;
  return json({
    ok: true,
    range,
    stages: [
      { key: "visited", label: "Visited site", count: Number(r.visited) },
      { key: "viewed_product", label: "Viewed a product", count: Number(r.viewed_product) },
      { key: "added_to_cart", label: "Added to cart", count: Number(r.added_to_cart) },
      { key: "started_checkout", label: "Started checkout", count: Number(r.started_checkout) },
      { key: "clicked_pay", label: "Clicked Pay", count: Number(r.clicked_pay) },
      { key: "opened_modal", label: "Opened Razorpay", count: Number(r.opened_modal) },
      { key: "purchased", label: "Purchased", count: Number(r.purchased) },
    ],
    total_sessions: Number(r.total_sessions),
  });
}
