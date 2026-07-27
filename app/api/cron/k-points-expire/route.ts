export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { expirePoints } from "@/lib/k-points/service";

// Expires K-Points past their expiry date (FIFO). Authorized with the same
// CRON_SECRET bearer token as the other crons. Run daily:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://madenkorea.com/api/cron/k-points-expire
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  return !!(bearer && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const result = await expirePoints(1000);
  return NextResponse.json({ ok: true, ...result });
}
