import { NextResponse } from "next/server";

// DISABLED. This route was an orphaned legacy path (no callers) that used the
// service-role client to INSERT orders with status='paid' + influencer
// attribution with NO authentication and NO payment verification — i.e. anyone
// could POST to mint paid orders and commission rows. The real, verified order
// flow is /api/orders/create -> /api/razorpay/create -> /api/razorpay/verify.
// Hard-disabled rather than deleted so any stray reference 410s instead of 404s.
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ ok: false, error: "GONE" }, { status: 410 });
}
export async function GET() {
  return NextResponse.json({ ok: false, error: "GONE" }, { status: 410 });
}
