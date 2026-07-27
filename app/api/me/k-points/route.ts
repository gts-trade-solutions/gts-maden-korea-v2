import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { getBalance, getLedger } from "@/lib/k-points/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Current user's K-Points balance (+ recent ledger). Used by the header chip
// and the account rewards page.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { authed: false, balance: { available: 0, reserved: 0, lifetimeEarned: 0, lifetimeSpent: 0 } },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const [balance, ledger] = await Promise.all([getBalance(userId), getLedger(userId, 50)]);
  return NextResponse.json(
    { authed: true, balance, ledger },
    { headers: { "cache-control": "no-store" } },
  );
}
