export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
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

  try {
    // Per-session funnel. There's no server-side session-pivot available here,
    // so we pull all events in the window and derive the per-session stage
    // flags in JS. Admin-only, so the cost is fine.
    const cutoff = new Date(
      Date.now() -
        ({ "1 day": 1, "7 days": 7, "30 days": 30, "90 days": 90 }[interval] ?? 7) *
          24 *
          60 *
          60 *
          1000
    );

    const rows = await prisma.events.findMany({
      where: { occurred_at: { gte: cutoff } },
      select: { session_id: true, event_name: true },
    });

    const seen: Record<string, Set<string>> = {};
    for (const r of rows) {
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

    return json(
      jsonSafe({
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
      })
    );
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
