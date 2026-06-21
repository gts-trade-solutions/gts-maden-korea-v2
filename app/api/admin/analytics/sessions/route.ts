export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const RANGE_DAYS: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 };

/**
 * Sessions in the window, summarized with the highest funnel stage they
 * reached. Sorted with "abandoned at checkout" first (clicked_pay or
 * checkout_started without order_placed) — those are the most actionable
 * stories for understanding why people aren't buying.
 */
export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "7d";
  const filter = url.searchParams.get("filter") || "all";
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 1000);

  const days = RANGE_DAYS[range] ?? 7;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const admin = createAdminClient();

  // Pull events in window. Bound the result set with a generous cap so
  // we don't OOM on a busy store; admin-only, so cost is fine.
  const { data: rows, error: e1 } = await admin
    .from("events")
    .select("session_id, anon_id, user_id, event_name, occurred_at, path, device, utm, referrer, props")
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: true })
    .limit(20000);

  if (e1) return json({ ok: false, error: e1.message }, 500);

  type Row = (typeof rows)[number];
  const bySession = new Map<
    string,
    {
      session_id: string;
      anon_id: string;
      user_id: string | null;
      first_at: string;
      last_at: string;
      events_count: number;
      pages_count: number;
      stages: Set<string>;
      device_type: string | null;
      referrer: string | null;
      utm_source: string | null;
      first_path: string | null;
      products_viewed: Set<string>;
    }
  >();

  for (const r of rows || []) {
    const s = bySession.get(r.session_id);
    const dev = (r.device as any)?.type ?? null;
    const utmSource = (r.utm as any)?.source ?? null;
    const productId = (r.props as any)?.product_id ?? null;

    if (!s) {
      bySession.set(r.session_id, {
        session_id: r.session_id,
        anon_id: r.anon_id,
        user_id: r.user_id,
        first_at: r.occurred_at,
        last_at: r.occurred_at,
        events_count: 1,
        pages_count: r.event_name === "page_view" ? 1 : 0,
        stages: new Set([r.event_name]),
        device_type: dev,
        referrer: r.referrer ?? null,
        utm_source: utmSource,
        first_path: r.path ?? null,
        products_viewed: productId && r.event_name === "product_view" ? new Set([productId]) : new Set(),
      });
    } else {
      s.last_at = r.occurred_at;
      s.events_count++;
      if (r.event_name === "page_view") s.pages_count++;
      s.stages.add(r.event_name);
      if (productId && r.event_name === "product_view") s.products_viewed.add(productId);
      if (r.user_id && !s.user_id) s.user_id = r.user_id;
    }
  }

  // Highest stage helper.
  const STAGE_ORDER = [
    "page_view",
    "product_view",
    "add_to_cart",
    "checkout_started",
    "pay_clicked",
    "payment_modal_opened",
    "order_placed",
  ];

  // Resolve display names/emails for any logged-in users seen in the
  // window so the table shows "Derin · derin@example.com" instead of
  // an opaque user_id prefix.
  const userIds = Array.from(
    new Set(
      Array.from(bySession.values())
        .map((s) => s.user_id)
        .filter((x): x is string => !!x)
    )
  );
  const profileMap: Record<string, { name: string | null; email: string | null }> = {};
  if (userIds.length) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profs || []) {
      profileMap[p.id] = {
        name: (p as any).full_name ?? null,
        email: null,
      };
    }
    // Email lives on auth.users — pull it via the admin auth API. We
    // do this per-id (small N: bounded by sessions in window) since
    // there's no batch endpoint.
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const { data } = await (admin as any).auth.admin.getUserById(uid);
          const email = data?.user?.email ?? null;
          profileMap[uid] = {
            name: profileMap[uid]?.name ?? null,
            email,
          };
        } catch {
          // best-effort — leave email null
        }
      })
    );
  }

  const sessions = Array.from(bySession.values()).map((s) => {
    let highest = "—";
    for (const st of STAGE_ORDER) if (s.stages.has(st)) highest = st;
    // Per-funnel-stage flags so the public response can be filtered
    // 1:1 with the funnel page without recomputing from raw events.
    const visited = s.stages.has("page_view");
    const viewed_product = s.stages.has("product_view");
    const added_to_cart = s.stages.has("add_to_cart");
    const started_checkout = s.stages.has("checkout_started");
    const clicked_pay = s.stages.has("pay_clicked");
    const opened_modal = s.stages.has("payment_modal_opened");
    const purchased = s.stages.has("order_placed");
    const failed = s.stages.has("payment_failed");
    const cancelled = s.stages.has("payment_cancelled");
    const abandoned =
      (started_checkout || clicked_pay || opened_modal) && !purchased;

    const profile = s.user_id ? profileMap[s.user_id] ?? null : null;

    return {
      session_id: s.session_id,
      anon_id: s.anon_id,
      user_id: s.user_id,
      user_name: profile?.name ?? null,
      user_email: profile?.email ?? null,
      first_at: s.first_at,
      last_at: s.last_at,
      duration_sec: Math.round(
        (new Date(s.last_at).getTime() - new Date(s.first_at).getTime()) / 1000
      ),
      events_count: s.events_count,
      pages_count: s.pages_count,
      products_viewed_count: s.products_viewed.size,
      highest_stage: highest,
      visited,
      viewed_product,
      added_to_cart,
      started_checkout,
      clicked_pay,
      opened_modal,
      purchased,
      abandoned,
      failed,
      cancelled,
      device_type: s.device_type,
      referrer: s.referrer,
      utm_source: s.utm_source,
      first_path: s.first_path,
    };
  });

  // Filter values map 1:1 to the funnel stage keys (so the funnel page
  // can deep-link via /admin/analytics/sessions?filter=<stage>) plus
  // the semantic outcome filters. Each "reached at least" predicate
  // uses the same boolean flags the funnel pivot uses, so counts here
  // match the funnel exactly.
  const filtered = sessions.filter((s) => {
    switch (filter) {
      case "all":
        return true;
      case "visited":
        return s.visited;
      case "viewed_product":
        return s.viewed_product;
      case "added_to_cart":
        return s.added_to_cart;
      case "started_checkout":
        return s.started_checkout;
      case "clicked_pay":
        return s.clicked_pay;
      case "opened_modal":
        return s.opened_modal;
      case "purchased":
        return s.purchased;
      case "abandoned":
        return s.abandoned;
      case "failed":
        return s.failed || s.cancelled;
      default:
        return true;
    }
  });

  filtered.sort((a, b) => {
    if (a.abandoned !== b.abandoned) return a.abandoned ? -1 : 1;
    return new Date(b.last_at).getTime() - new Date(a.last_at).getTime();
  });

  return json({ ok: true, range, filter, sessions: filtered.slice(0, limit) });
}
