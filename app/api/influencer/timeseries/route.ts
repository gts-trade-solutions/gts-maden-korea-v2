export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// Influencer click/order timeseries for the dashboard chart (MetricsChart).
//
// This replaces the old `supabase.rpc("influencer_timeseries", { p_from, p_to,
// p_user })` call. The RPC body does not live in this repo, so we reproduce a
// faithful daily aggregation from MySQL:
//   • clicks — referral_clicks (joined to the influencer's referral_links) per
//     day, bucketed by clicked_at.
//   • orders — order_attributions for the influencer per day, bucketed by
//     created_at.
// The series is scoped to the logged-in influencer (user.id === influencer_id),
// gap-filled with zeros across the full [from, to] window, and returned as
// `{ day: "YYYY-MM-DD", clicks, orders }[]` — exactly what MetricsChart maps.
//
// NOTE: days are bucketed in UTC (occurred_at date via ISO string), so a click
// just before local midnight lands on its UTC calendar day. This matches how
// the dashboard renders points and avoids server-timezone drift.
function toDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from") ?? "";
  const toRaw = url.searchParams.get("to") ?? "";

  // Resolve the window. Default to the trailing 30 days when a bound is
  // missing/invalid. `from` anchors to 00:00:00.000Z, `to` to 23:59:59.999Z
  // (inclusive), mirroring a `created_at::date BETWEEN p_from AND p_to`.
  const now = new Date();
  const parsedTo = toRaw ? new Date(`${toRaw}T23:59:59.999Z`) : null;
  const toDate =
    parsedTo && !isNaN(parsedTo.getTime())
      ? parsedTo
      : new Date(`${toDayKey(now)}T23:59:59.999Z`);

  const parsedFrom = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : null;
  let fromDate =
    parsedFrom && !isNaN(parsedFrom.getTime())
      ? parsedFrom
      : new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);
  fromDate = new Date(`${toDayKey(fromDate)}T00:00:00.000Z`);

  if (fromDate.getTime() > toDate.getTime()) {
    return NextResponse.json({ ok: true, data: [] });
  }

  try {
    // Clicks: referral_clicks for links owned by this influencer.
    const links = await prisma.referral_links.findMany({
      where: { influencer_id: userId },
      select: { id: true },
    });
    const linkIds = links.map((l) => l.id);

    const clickRows = linkIds.length
      ? await prisma.referral_clicks.findMany({
          where: {
            referral_id: { in: linkIds },
            clicked_at: { gte: fromDate, lte: toDate },
          },
          select: { clicked_at: true },
        })
      : [];

    // Orders: attributions credited to this influencer.
    const orderRows = await prisma.order_attributions.findMany({
      where: {
        influencer_id: userId,
        created_at: { gte: fromDate, lte: toDate },
      },
      select: { created_at: true },
    });

    // Bucket by UTC day.
    const clicksByDay = new Map<string, number>();
    for (const r of clickRows) {
      const k = toDayKey(r.clicked_at);
      clicksByDay.set(k, (clicksByDay.get(k) ?? 0) + 1);
    }
    const ordersByDay = new Map<string, number>();
    for (const r of orderRows) {
      const k = toDayKey(r.created_at);
      ordersByDay.set(k, (ordersByDay.get(k) ?? 0) + 1);
    }

    // Gap-fill every day in the window with zeros.
    const data: { day: string; clicks: number; orders: number }[] = [];
    const cursor = new Date(fromDate.getTime());
    while (cursor.getTime() <= toDate.getTime()) {
      const k = toDayKey(cursor);
      data.push({
        day: k,
        clicks: clicksByDay.get(k) ?? 0,
        orders: ordersByDay.get(k) ?? 0,
      });
      cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 400 }
    );
  }
}
