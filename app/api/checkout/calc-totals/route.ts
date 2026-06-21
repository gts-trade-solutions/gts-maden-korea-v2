import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getRouteUser } from "@/lib/auth/routeUser";
import { getPromoCodeFromCookie } from "@/lib/promo-cookie";
import {
  roundMoney,
  isSupportedCurrency,
  type CurrencyCode,
} from "@/lib/currency";
import { computeShippingFee } from "@/lib/membership";
import { getShippingConfig } from "@/lib/storeSettings";
import {
  getCountryShippingRate,
  getIntlShippingSettings,
  totalCartWeightGrams,
  computeIntlShippingInr,
} from "@/lib/internationalShipping";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";
import { fetchCountryOffers, effectivePriceForCountry } from "@/lib/pricing";

type LineInput = { product_id: string; qty: number };

// Per-influencer commission cap lives on
// influencer_profiles.commission_cap_pct (admin-managed). The previous
// GLOBAL_CAP_PERCENT = 25 constant is gone; we look up the cap per
// promo based on its influencer_id.
//
// NOTE: The `influence_caps` table (per-product overrides) is no
// longer read here. Kept in the DB schema and will be re-wired later;
// see CODEBASE_REFERENCE.md → "Deferred wiring".

// Legacy isSaleActive/effectiveUnitPrice removed in favor of the
// country-aware resolver in lib/pricing.ts. The new resolver checks
// product_country_prices first (visitor's country offer wins), then
// falls through to today's sale_price/price logic — so a country with
// no offer set sees identical pricing to before this change.

export async function POST(req: NextRequest) {
const body = await req.json().catch(() => ({}));
const lines: LineInput[] = Array.isArray(body?.lines) ? body.lines : [];

// C-32 fix: shipping fee is computed server-side from the cart subtotal
// and the user's membership status. The previous override
// (`body.shippingFee`) let any caller force shipping to 0; that path is
// now removed entirely. If clients send a `shippingFee` value it is
// silently ignored.

  if (!lines.length) {
    return NextResponse.json(
      { ok: false, error: "EMPTY_CART" },
      { status: 400 }
    );
  }

  if (!lines.every((l) => l.product_id && Number(l.qty) > 0)) {
    return NextResponse.json(
      { ok: false, error: "BAD_LINES" },
      { status: 400 }
    );
  }

  const sb = createAdminClient();
  const useMysql = process.env.CATALOG_BACKEND === "mysql";

  const userId = (await getRouteUser(req))?.id ?? null;

  const productIds = Array.from(new Set(lines.map((l) => l.product_id)));

  let products: any[];
  if (useMysql) {
    const { getCheckoutProductsMysql } = await import("@/lib/data/checkout");
    products = await getCheckoutProductsMysql(productIds);
  } else {
    const { data, error: pErr } = await sb
      .from("products")
      .select(
        "id,name,price,currency,is_published,promo_exempt,sale_price,sale_starts_at,sale_ends_at,stock_qty,net_weight_g,gross_weight_g"
      )
      .in("id", productIds);
    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    }
    products = data ?? [];
  }

  const prodMap = new Map((products as any[]).map((p: any) => [p.id, p]));

  if (prodMap.size !== productIds.length) {
    return NextResponse.json(
      { ok: false, error: "PRODUCT_NOT_FOUND" },
      { status: 404 }
    );
  }

  // All products are stored canonically in INR. The mixed-currency
  // guard from the INR-only era is gone — international support
  // (model A) does the per-buyer FX conversion further down. We still
  // validate that every row claims INR so a future bad import row
  // doesn't silently slip in.
  for (const p of products as any[]) {
    if (!p.is_published) {
      return NextResponse.json(
        { ok: false, error: "UNPUBLISHED_ITEM" },
        { status: 400 }
      );
    }
    if (Number(p.stock_qty ?? 0) <= 0) {
      return NextResponse.json(
        { ok: false, error: "OUT_OF_STOCK_ITEM", product_id: p.id },
        { status: 400 }
      );
    }
    if (p.currency && p.currency !== "INR") {
      return NextResponse.json(
        { ok: false, error: "NON_INR_PRODUCT_PRICE", product_id: p.id },
        { status: 500 }
      );
    }
  }

  // Per-product caps from `influence_caps` are intentionally NOT
  // queried right now — that's the deferred wiring noted at the top.
  // The only cap that governs checkout math is the influencer's own
  // commission_cap_pct, resolved per-promo below.

  // Country/currency resolution is needed BOTH for the shipping branch
  // further down AND for the per-influencer region check inside the
  // promo block — so lift it here once.
  const cookieJar = cookies();
  const rawCountry = cookieJar.get("mik_country")?.value;
  const country = isSupportedCountry(rawCountry) ? rawCountry : DEFAULT_COUNTRY;
  const rawCurrency = cookieJar.get("mik_currency")?.value;
  const buyerCurrency: CurrencyCode =
    isSupportedCurrency(rawCurrency) ? rawCurrency : "INR";
  const isIntl = country !== "IN";

  // Fetch country-specific offer prices once for all products in the
  // cart. Empty map (no offers configured for any of these products in
  // this country) means the resolver falls through to legacy
  // sale_price/price for each line — identical behavior to before
  // country offers existed.
  const countryOffers = useMysql
    ? await (await import("@/lib/data/catalog")).fetchCountryOffersMysql(productIds, country)
    : await fetchCountryOffers(productIds, country, sb);

  const code = getPromoCodeFromCookie();
  let promo: any = null;
  let influencerCap: number | null = null;

  if (code) {
    let row: any = null;
    if (useMysql) {
      const { getPromoDetailsMysql } = await import("@/lib/data/checkout");
      row = await getPromoDetailsMysql(code);
    } else {
      const { data: pd, error: perr } = await sb.rpc("get_promo_details", { p_code: code });
      if (perr) {
        return NextResponse.json({ ok: false, error: perr.message }, { status: 500 });
      }
      row = (Array.isArray(pd) ? pd[0] : pd) as any;
    }

    if (row) {
      promo = {
        id: row.id,
        code: row.code,
        scope: row.scope,
        influencer_id: row.influencer_id,
        product_id: row.product_id,
        user_discount_percent: Number(row.user_discount_percent),
        commission_percent: Number(row.commission_percent),
      };

      // Resolve this influencer's cap + region allow-list. If the cap
      // is missing (data corruption, manual SQL insert) we treat the
      // promo as ineligible — safer than letting it run uncapped.
      //
      // Region check is the second defence (the first is at
      // /api/promo/apply): if the buyer switched country after applying
      // the code and the new country isn't on the allow-list, we
      // silently drop the promo so we don't charge a bogus discount.
      // The cart still renders successfully — just without the promo.
      if (promo.influencer_id) {
        const prof = useMysql
          ? await (await import("@/lib/data/checkout")).getInfluencerCapMysql(promo.influencer_id)
          : (
              await sb
                .from("influencer_profiles")
                .select("commission_cap_pct, applicable_countries")
                .eq("user_id", promo.influencer_id)
                .maybeSingle()
            ).data;
        if (prof && prof.commission_cap_pct != null) {
          influencerCap = Number(prof.commission_cap_pct);
        }
        const regions = Array.isArray((prof as any)?.applicable_countries)
          ? ((prof as any).applicable_countries as string[])
          : [];
        if (regions.length > 0 && !regions.includes(country)) {
          // Drop the promo silently. The buyer keeps shopping, the
          // cart just shows the un-discounted total.
          promo = null;
          influencerCap = null;
        }
      }
    }
  }

  const lineResults: any[] = [];
  let subtotal = 0;
  let discount_total = 0;
  let commission_total = 0;

  for (const l of lines) {
    const p = prodMap.get(l.product_id)!;
    const qty = Number(l.qty);

    const unit = effectivePriceForCountry(p, countryOffers);
    const lineSub = roundMoney(unit * qty);
    subtotal = roundMoney(subtotal + lineSub);

    let effUserPct = 0;
    let effCommPct = 0;

    const eligible =
      !!promo &&
      influencerCap != null &&
      !p.promo_exempt &&
      (promo.scope === "global" || promo.product_id === p.id);

    if (eligible) {
      // Only one cap source now: this influencer's per-account cap.
      // No product fallback (deferred), no global constant fallback.
      const cap = influencerCap!;

      effCommPct = Math.min(promo.commission_percent, cap);
      effUserPct = Math.max(
        0,
        Math.min(promo.user_discount_percent, cap - effCommPct)
      );
    }

    const lineDiscount = roundMoney(lineSub * (effUserPct / 100));
    const lineCommission = roundMoney(lineSub * (effCommPct / 100));

    discount_total = roundMoney(discount_total + lineDiscount);
    commission_total = roundMoney(commission_total + lineCommission);

    lineResults.push({
      product_id: p.id,
      qty,
      unit_price: unit,
      line_subtotal: lineSub,
      promo_applied: eligible,
      effective_user_discount_pct: effUserPct,
      effective_commission_pct: effCommPct,
      line_discount: lineDiscount,
      line_commission: lineCommission,
    });
  }

  let activeMembership: { status: string; ends_at: string } | null = null;

  if (userId) {
    if (useMysql) {
      const { getActiveMembershipMysql } = await import("@/lib/data/checkout");
      activeMembership = (await getActiveMembershipMysql(userId)) as any;
    } else {
      const { data: membership } = await sb
        .from("user_memberships")
        .select("status, ends_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      activeMembership = membership ?? null;
    }
  }

  // ─── International vs Indian shipping branch ────────────────────
  //
  // India: existing threshold + K-Plus logic in lib/membership.ts.
  //
  // Non-IN: slab pricing on `country_shipping_rates`. The cart's
  // gross weight (sum of products.gross_weight_g × qty) is inflated
  // by `store_settings.intl_packaging_tare_pct`, bracketed to the
  // smallest of nine slab cutoffs (0.5/1/2/3/5/7/10/15/20 kg), looked
  // up against the destination row, then multiplied by
  // `(1 + intl_buffer_pct/100)` to derive the customer fee. If the
  // effective weight exceeds `intl_max_shipping_weight_kg * 1000`,
  // checkout is blocked with SHIPPING_CAP_EXCEEDED.
  //
  // Buyer currency comes from the `mik_currency` cookie; the amount
  // sent to Razorpay is INR × current FX rate, snapshotted on the
  // order at create-time. (Country/currency vars are declared above
  // because the promo block also needs them.)

  let shipping_fee_inr = 0;
  let shippingError:
    | { code: string; error: string; product_id?: string; maxKg?: number; effectiveKg?: number }
    | null = null;

  // Slab metadata for the cart/checkout UX hint ("you can add 150g more
  // in this tier", "next tier 2 kg adds +₹524"). Only set for
  // international orders with a successful slab lookup.
  let shippingSlab: {
    effective_weight_g: number;
    current_slab_label: string;
    current_slab_cutoff_g: number;
    remaining_in_slab_g: number;
    is_max_slab: boolean;
    next_slab_label: string | null;
    next_slab_fee_inr: number | null;
    next_slab_delta_inr: number | null;
  } | null = null;

  if (!isIntl) {
    const shippingConfig = await getShippingConfig();
    shipping_fee_inr = roundMoney(
      computeShippingFee(subtotal, activeMembership, shippingConfig)
    );
  } else {
    // Every product participating in an international cart MUST have a
    // positive gross_weight_g. Catching this here means the UI can show
    // a clear "missing weight" error instead of Razorpay failing later.
    const missing = (products as any[]).filter(
      (p) => !p.gross_weight_g || Number(p.gross_weight_g) <= 0
    );
    if (missing.length > 0) {
      shippingError = {
        code: "MISSING_PRODUCT_WEIGHT",
        error: "MISSING_PRODUCT_WEIGHT",
        product_id: missing[0].id,
      };
    } else {
      const [rate, settings] = await Promise.all([
        getCountryShippingRate(country),
        getIntlShippingSettings(),
      ]);
      if (!rate) {
        shippingError = {
          code: "NO_SHIPPING_RATE_FOR_COUNTRY",
          error: "NO_SHIPPING_RATE_FOR_COUNTRY",
        };
      } else {
        const grossG = totalCartWeightGrams(
          lines.map((l) => ({
            qty: l.qty,
            gross_weight_g: prodMap.get(l.product_id)?.gross_weight_g ?? null,
          }))
        );
        const result = computeIntlShippingInr({ grossG, rate, settings });
        if (!result.ok) {
          if (result.reason === "OVER_CAP") {
            shippingError = {
              code: "SHIPPING_CAP_EXCEEDED",
              error: "SHIPPING_CAP_EXCEEDED",
              maxKg: settings.intl_max_shipping_weight_kg,
              effectiveKg: Math.round((result.effectiveG / 1000) * 100) / 100,
            };
          } else {
            shippingError = {
              code: "NO_SHIPPING_RATE_FOR_COUNTRY",
              error: "NO_SHIPPING_RATE_FOR_COUNTRY",
            };
          }
        } else {
          shipping_fee_inr = roundMoney(result.amountInr);
          shippingSlab = {
            effective_weight_g: result.effectiveG,
            current_slab_label: result.slabLabel,
            current_slab_cutoff_g: result.slabCutoffG,
            remaining_in_slab_g: result.remainingInSlabG,
            is_max_slab: result.nextSlab === null,
            next_slab_label: result.nextSlab?.label ?? null,
            next_slab_fee_inr: result.nextSlab?.amountInr ?? null,
            next_slab_delta_inr: result.nextSlab?.deltaInr ?? null,
          };
        }
      }
    }
  }

  if (shippingError) {
    return NextResponse.json(
      { ok: false, ...shippingError },
      { status: 400 }
    );
  }

  const total = roundMoney(subtotal + shipping_fee_inr - discount_total);

  // Response amounts are in INR — the storefront's `useCurrency()`
  // hook converts to the buyer's currency at render-time via
  // `formatPrice(amountInr)`. Keeping the response INR-canonical
  // means callers don't have to know whether they're rendering for
  // an Indian or international visitor; the conversion is one
  // consistent layer, not two.
  //
  // razorpay/create re-reads the order row (INR) and applies the FX
  // snapshot when it creates the Razorpay order, so it doesn't
  // consume calc-totals output at all.

  return NextResponse.json({
    ok: true,
    currency: "INR",
    subtotal,
    shipping_fee: shipping_fee_inr,
    discount_total,
    total,
    country,
    is_intl: isIntl,
    buyer_currency: buyerCurrency,
    commission_total,
    applied: promo
      ? {
          type: "promo",
          code: promo.code,
          scope: promo.scope,
          influencer_id: promo.influencer_id,
        }
      : null,
    shipping_slab: shippingSlab,
    lines: lineResults,
  });
}
