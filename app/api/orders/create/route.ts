import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUserId } from "@/lib/auth/identity";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";
import {
  isSupportedCurrency,
  FALLBACK_RATES,
  roundMoney,
  type CurrencyCode,
} from "@/lib/currency";

export const dynamic = "force-dynamic";

// POST /api/orders/create  { address, notes, redeemPoints? }
// Creates the pending order in MySQL (source of truth). Reprices the cart to
// live prices first (so the order == the calc-totals total the customer saw),
// then builds the pending order + items. Optionally reserves K-Points and
// records the redemption on the order so razorpay/create charges the reduced
// total.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const address = body?.address ?? null;
  const notes = body?.notes ?? null;
  const redeemPoints = Math.max(0, Math.floor(Number(body?.redeemPoints) || 0));

  const jar = cookies();
  const rawCountry = jar.get("mik_country")?.value;
  const country = isSupportedCountry(rawCountry) ? rawCountry : DEFAULT_COUNTRY;
  const rawCurrency = jar.get("mik_currency")?.value;
  const buyerCurrency: CurrencyCode = isSupportedCurrency(rawCurrency) ? rawCurrency : "INR";

  try {
    const { repriceCartToLiveMysql, createOrderFromCartMysql } = await import("@/lib/data/orders");
    // Best-effort reprice: on failure we fall through to the cart snapshot,
    // never blocking checkout.
    await repriceCartToLiveMysql(userId, country).catch((e) =>
      console.error("[orders/create] reprice failed (using snapshot):", e)
    );
    const info = await createOrderFromCartMysql(userId, address, notes);

    // ── Optional K-Points redemption ──
    let pointsApplied = 0;
    let pointsDiscountInr = 0;
    if (redeemPoints > 0) {
      try {
        const { computeRedeemQuote, reserve } = await import("@/lib/k-points/service");
        const { getCurrencyRate } = await import("@/lib/data/payments");
        let fx = 1;
        if (buyerCurrency !== "INR") {
          fx =
            Number(await getCurrencyRate(buyerCurrency)) ||
            FALLBACK_RATES[buyerCurrency]?.rate_from_inr ||
            1;
        }
        // K-Points offset the product cost only; shipping is always paid.
        const redeemBaseInr = roundMoney(Math.max(0, info.subtotal - info.discount_total));
        const quote = await computeRedeemQuote({
          userId,
          requestedPoints: redeemPoints,
          payableInr: redeemBaseInr,
          buyerCurrency,
          fxRate: fx,
        });
        if (quote.appliedPoints > 0 && quote.valueInr > 0) {
          // Reserve first; only persist the redemption if the hold succeeds.
          const res = await reserve({
            userId,
            points: quote.appliedPoints,
            orderId: info.order_id,
          });
          if (res.ok) {
            const { prisma } = await import("@/lib/db/prisma");
            await prisma.orders.update({
              where: { id: info.order_id },
              data: {
                points_redeemed_qty: quote.appliedPoints,
                points_redeemed_amount: quote.valueInr,
              },
            });
            pointsApplied = quote.appliedPoints;
            pointsDiscountInr = quote.valueInr;
          }
        }
      } catch (e) {
        // Never block checkout on a redemption hiccup — order proceeds at full price.
        console.error("[orders/create] k-points redemption skipped:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      ...info,
      points_applied: pointsApplied,
      points_discount: pointsDiscountInr,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "ORDER_CREATE_FAILED" }, { status: 500 });
  }
}
