export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

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

  const sb = admin();
  // Pull the attribution + the order's order_number + paid_at for
  // display, and the influencer's handle for at-a-glance ID. Two
  // separate queries because PostgREST doesn't gracefully embed a
  // 1-to-1 join across two non-FK relationships in one go for our
  // schema shape. Acceptable — the admin page paginates 100/screen.
  const { data: rows, error: dbErr, count } = await sb
    .from("order_attributions")
    .select(
      "order_id, influencer_id, commission_amount, commission_percent, currency, status, created_at, attributed_by, promo_code_id",
      { count: "exact" }
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);

  // Enrich with order_number + paid_at + influencer handle in one
  // pass each. Small N (page size = 100).
  const orderIds = Array.from(new Set((rows ?? []).map((r) => r.order_id)));
  const inflIds = Array.from(new Set((rows ?? []).map((r) => r.influencer_id)));

  const [{ data: orderRows }, { data: inflRows }] = await Promise.all([
    sb.from("orders")
      .select("id, order_number, paid_at, status, total_inr, total, currency")
      .in("id", orderIds),
    sb.from("influencer_profiles")
      .select("user_id, handle, display_name")
      .in("user_id", inflIds),
  ]);

  const orderMap = new Map((orderRows ?? []).map((o: any) => [o.id, o]));
  const inflMap = new Map((inflRows ?? []).map((i: any) => [i.user_id, i]));

  const enriched = (rows ?? []).map((r: any) => ({
    ...r,
    order: orderMap.get(r.order_id) ?? null,
    influencer: inflMap.get(r.influencer_id) ?? null,
  }));

  return json({ ok: true, total: count ?? enriched.length, rows: enriched });
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

  const sb = admin();
  const { error: upErr } = await sb
    .from("order_attributions")
    .update({ status })
    .eq("order_id", orderId);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  // Dual-write: mirror the attribution status into MySQL (the influencer
  // withdraw balance reads approved/void attributions from MySQL).
  try {
    const { mirrorOrderAttributionIntoMysql } = await import("@/lib/data/attribution");
    await mirrorOrderAttributionIntoMysql(sb, orderId);
  } catch (e) {
    console.error("[dual-write] commission status MySQL mirror failed:", e);
  }

  return json({ ok: true });
}
