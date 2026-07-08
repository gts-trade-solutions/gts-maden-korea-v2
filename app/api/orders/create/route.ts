import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUserId } from "@/lib/auth/identity";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

export const dynamic = "force-dynamic";

// POST /api/orders/create  { address, notes }
// Creates the pending order in MySQL (source of truth). Reprices the cart to
// live prices first (so the order == the calc-totals total the customer saw),
// then builds the pending order + items. Returns the shape the checkout hook
// expects.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const address = body?.address ?? null;
  const notes = body?.notes ?? null;

  const rawCountry = cookies().get("mik_country")?.value;
  const country = isSupportedCountry(rawCountry) ? rawCountry : DEFAULT_COUNTRY;

  try {
    const { repriceCartToLiveMysql, createOrderFromCartMysql } = await import("@/lib/data/orders");
    // Best-effort reprice: on failure we fall through to the cart snapshot,
    // never blocking checkout.
    await repriceCartToLiveMysql(userId, country).catch((e) =>
      console.error("[orders/create] reprice failed (using snapshot):", e)
    );
    const info = await createOrderFromCartMysql(userId, address, notes);
    return NextResponse.json({ ok: true, ...info });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ORDER_CREATE_FAILED" }, { status: 500 });
  }
}
