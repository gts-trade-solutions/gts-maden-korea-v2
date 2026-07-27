export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/k-points/service";

// Releases K-Points reservations whose pending order was never paid within the
// reservation TTL, returning the held points to the users' available balance.
// Authorized with the same CRON_SECRET bearer token as the other crons:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://madenkorea.com/api/cron/k-points-release
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  return !!(bearer && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const released = await releaseExpiredReservations(500);
  return NextResponse.json({ ok: true, released });
}
