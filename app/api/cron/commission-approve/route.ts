export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

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
  let settings: { commission_auto_approve_days: number } | null;
  try {
    settings = await prisma.store_settings.findFirst({
      where: { id: 1 },
      select: { commission_auto_approve_days: true },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "settings_query_failed" },
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
  const cutoff = new Date(cutoffMs);
  const cutoffIso = cutoff.toISOString();

  // Find pending attributions on orders paid before the cutoff.
  // Two-step (select then update) so we can return ids for the log
  // without relying on the SQL UPDATE … RETURNING shape.
  let pendingRows: { order_id: string }[];
  try {
    pendingRows = await prisma.order_attributions.findMany({
      where: {
        status: "pending",
        orders: {
          paid_at: { lte: cutoff },
          status: { in: ["paid", "processing", "shipped", "delivered"] },
        },
      },
      select: { order_id: true },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "pending_query_failed" },
      { status: 500 }
    );
  }

  const orderIds = (pendingRows ?? []).map((r) => r.order_id);
  if (orderIds.length === 0) {
    return NextResponse.json({
      ok: true,
      approved: 0,
      reason: "no pending rows past cutoff",
      cutoff: cutoffIso,
    });
  }

  // Flip pending → approved for the matched set. Idempotent —
  // already-approved rows aren't touched. Writes MySQL directly, so the
  // old Supabase→MySQL dual-write mirror is no longer needed.
  try {
    await prisma.order_attributions.updateMany({
      where: { order_id: { in: orderIds }, status: "pending" },
      data: { status: "approved" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "update_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    approved: orderIds.length,
    cutoff: cutoffIso,
    days,
  });
}
