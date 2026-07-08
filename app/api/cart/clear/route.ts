import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { clearCartMysql } from "@/lib/data/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ ok: true }); // nothing to clear

    // Empty the user's MySQL cart + zero totals (account/cart pages read the
    // cart from MySQL).
    await clearCartMysql(userId);

    return NextResponse.json({ ok: true }); // don't fail the UX
  } catch {
    return NextResponse.json({ ok: true });
  }
}
