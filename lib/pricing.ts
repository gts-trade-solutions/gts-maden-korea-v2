// lib/pricing.ts
//
// Two layers:
//
// 1. `effectiveUnitPrice` — legacy sync helper. Resolves the current
//    charge from the existing `price`/`sale_price`/`sale_starts_at`/
//    `sale_ends_at` columns. Still used by client-only paths that
//    don't have a country offer map handy.
//
// 2. `fetchCountryOffers` + `effectivePriceForCountry` — country-aware
//    layer (Phase 1). The resolver checks `product_country_prices`
//    first; if a row exists for the visitor's country (and is_active),
//    that offer wins. Otherwise it falls through to the legacy logic
//    so countries without an explicit offer keep today's pricing
//    untouched.
//
// All amounts here are in INR (the canonical storage currency).
// FX conversion for display is the caller's responsibility — see
// `lib/currency.ts` and `useCurrency()`.

// Structural constraint for any product object that carries the
// legacy pricing fields. Each field accepts `undefined` so this
// matches the various looser product types used across pages
// (CardProduct, CompactProduct, cart row products, etc.) without
// forcing each caller to re-shape its data.
type ProductPriceFields = {
  id?: string | null;
  price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
};

export function effectiveUnitPrice(p: ProductPriceFields): number {
  const now = Date.now();
  const withinSale =
    p.sale_price != null &&
    (!p.sale_starts_at || new Date(p.sale_starts_at).getTime() <= now) &&
    (!p.sale_ends_at || new Date(p.sale_ends_at).getTime() >= now);

  return withinSale ? Number(p.sale_price) : Number(p.price ?? 0);
}

// product_id → offer_price (INR). Empty/missing key means "no
// country-specific offer for this product in this country" — the
// resolver falls through to the legacy sale_price/price logic.
export type CountryOfferMap = Record<string, number>;

// Minimal structural type for the Supabase client surface we use.
// Avoids pinning to a specific client (route, admin, browser) so this
// helper works in every layer.
type SupabaseLike = {
  from: (table: string) => any;
};

/**
 * Bulk-fetch active per-country offer prices for a set of products in
 * a single round-trip. Pass the result into `effectivePriceForCountry`
 * for each product line.
 *
 * Returns an empty map for empty input or query error — callers fall
 * back to legacy pricing in either case, so a failure here degrades
 * gracefully (visitor sees today's price instead of crashing).
 */
export async function fetchCountryOffers(
  productIds: string[],
  countryCode: string,
  sb: SupabaseLike
): Promise<CountryOfferMap> {
  if (!productIds.length || !countryCode) return {};
  const { data, error } = await sb
    .from("product_country_prices")
    .select("product_id, offer_price")
    .in("product_id", productIds)
    .eq("country_code", countryCode)
    .eq("is_active", true);
  if (error || !data) return {};
  const map: CountryOfferMap = {};
  for (const r of data as Array<{ product_id: string; offer_price: number | string }>) {
    map[r.product_id] = Number(r.offer_price);
  }
  return map;
}

/**
 * Resolve the unit price a visitor in `countryCode` should pay for
 * this product. Order:
 *   1. Country offer (if a row exists in product_country_prices)
 *   2. Legacy sale_price within window
 *   3. Legacy price
 *
 * `offers` is the map returned by `fetchCountryOffers`. Pass an empty
 * `{}` to skip the country-offer lookup entirely (e.g. country isn't
 * known yet) — the function will fall through to legacy pricing.
 */
export function effectivePriceForCountry(
  product: ProductPriceFields,
  offers: CountryOfferMap
): number {
  if (product.id && offers[product.id] != null) {
    return Number(offers[product.id]);
  }
  return effectiveUnitPrice(product);
}

/**
 * Augment a list of product objects with their country-aware
 * `effective_price`. One DB round-trip for the whole batch, then a
 * pure computation per row. The augmented objects keep all their
 * original fields plus a new `effective_price` number.
 *
 * Display surfaces (ProductCard, PDP, PLPs) should pass the result to
 * the card. The card reads `product.effective_price` if present and
 * falls back to its own legacy computation otherwise — so a page that
 * forgets to augment still renders correctly (just without the
 * country offer override).
 */
export async function augmentProductsWithCountryOffers<T extends ProductPriceFields>(
  products: T[],
  countryCode: string,
  sb: SupabaseLike
): Promise<Array<T & { effective_price: number }>> {
  const ids = products
    .map((p) => p.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const offers = await fetchCountryOffers(ids, countryCode, sb);
  return products.map((p) => ({
    ...p,
    effective_price: effectivePriceForCountry(p, offers),
  }));
}
