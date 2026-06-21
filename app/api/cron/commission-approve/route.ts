export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Daily cron — flips `order_attributions` rows from 'pending' to
// 'approved' once `store_settings.commission_auto_approve_days` have
// passed since `orders.paid_at`. Skipped automatically when the
// setting is 0 (verify route already approved on the spot).
//
// Authorized via the same CRON_SECRET bearer token the currency
// refresh uses. Trigger from Netlify Scheduled Functions, a cron job,
// or manually:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://madenkorea.com/api/cron/commission-approve

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;
  return !!(
    bearer &&
    process.env.CRON_SECRET &&
    bearer === process.env.CRON_SECRET
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  return runOnce();
}

// Allow GET too — some schedulers only fire GET requests.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  return runOnce();
}

async function runOnce() {
  // Pull current auto-approve window. 0 = approve immediately
  // (verify route handles it; cron has nothing to do this run).
  const { data: settings, error: setErr } = await supabaseAdmin
    .from("store_settings")
    .select("commission_auto_approve_days")
    .eq("id", 1)
    .maybeSingle();
  if (setErr) {
    return NextResponse.json(
      { ok: false, error: setErr.message },
      { status: 500 }
    );
  }
  const days = Number((settings as any)?.commission_auto_approve_days ?? 0);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({
      ok: true,
      approved: 0,
      reason: "auto_approve_days is 0; nothing to do",
    });
  }

  // Cutoff: any order paid more than N days ago whose attribution is
  // still pending → approve. We compute the cutoff in JS so the SQL
  // stays portable and we can log the exact threshold.
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  // Find pending attributions on orders paid before the cutoff.
  // Two-step (select then update) so we can return ids for the log
  // without relying on the SQL UPDATE … RETURNING shape.
  const { data: pendingRows, error: pErr } = await supabaseAdmin
    .from("order_attributions")
    .select("order_id, orders!inner(paid_at, status)")
    .eq("status", "pending")
    .lte("orders.paid_at", cutoffIso)
    .in("orders.status", ["paid", "processing", "shipped", "delivered"]);
  if (pErr) {
    return NextResponse.json(
      { ok: false, error: pErr.message },
      { status: 500 }
    );
  }

  const orderIds = (pendingRows ?? []).map((r: any) => r.order_id);
  if (orderIds.length === 0) {
    return NextResponse.json({
      ok: true,
      approved: 0,
      reason: "no pending rows past cutoff",
      cutoff: cutoffIso,
    });
  }

  // Flip pending → approved for the matched set. Idempotent —
  // already-approved rows aren't touched.
  const { error: updErr } = await supabaseAdmin
    .from("order_attributions")
    .update({ status: "approved" })
    .in("order_id", orderIds)
    .eq("status", "pending");
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message },
      { status: 500 }
    );
  }

  // Dual-write: mirror each approved attribution into MySQL (the influencer
  // withdraw balance reads approved attributions from MySQL). Best-effort.
  try {
    const { mirrorOrderAttributionIntoMysql } = await import("@/lib/data/attribution");
    for (const oid of orderIds) {
      await mirrorOrderAttributionIntoMysql(supabaseAdmin, oid);
    }
  } catch (e) {
    console.error("[dual-write] cron commission-approve MySQL mirror failed:", e);
  }

  return NextResponse.json({
    ok: true,
    approved: orderIds.length,
    cutoff: cutoffIso,
    days,
  });
}
