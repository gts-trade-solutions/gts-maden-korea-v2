# International Payments — Build Spec

Single source of truth for enabling Razorpay-backed checkout for non-Indian customers. Save this doc on every nontrivial change so future sessions stay aligned.

**Status**: spec locked, code not started. Last updated 2026-05-16.

---

## Confirmed inputs

| Topic | Decision |
|---|---|
| Razorpay International | Enabled on the merchant account. International cards + Apple Pay enabled. |
| Razorpay currency support | All 11 of our switcher currencies (INR, USD, EUR, GBP, PLN, ZAR, VND, TZS, NGN, QAR, AED) are on Razorpay's supported list. No manual-quote fallback needed. |
| Pricing model | **A — INR stored canonical, FX-converted at order creation.** The FX rate at order time is snapshotted on the row so the customer is billed the exact amount they saw. |
| International shipping | Admin-configured `₹/gram per country`. Order shipping = `sum(product.net_weight_g × qty) × country_rate_per_gram_inr`, then converted to buyer currency. India keeps its existing weight-agnostic threshold logic. |
| Product weight | `products.net_weight_g` becomes effectively required (admin form blocks save when missing). DB column stays nullable so existing rows don't error out; admin gets a "products missing weight" audit list. |
| Tax handling | DDU (customer pays at customs on delivery). No tax calculation on our side. A one-line disclosure is shown at checkout for non-IN orders. |
| K-Plus | Hidden completely for non-IN visitors — `/k-plus` page, `KPlusPromoBanner`, account section, all CTAs and benefit labels. |
| Address validation | Freeform for non-IN orders (city + postal code + country). India keeps PIN regex, state dropdown, GSTIN. |
| Order email language | English for v1 (matches MULTILANGUAGE.md deferred decision). |
| Currency minor unit | Driven by Razorpay's exponent table. Most currencies × 100; **VND × 1** (zero-decimal). Built into code, not hardcoded per currency. |

---

## Razorpay exponent reference (only currencies relevant to us)

| ISO | Exponent | Multiplier |
|---|---|---|
| INR, USD, EUR, GBP, PLN, ZAR, TZS, NGN, QAR, AED | 2 | × 100 |
| VND | 0 | × 1 |

(Full Razorpay table covers 120+ currencies; we encode it once and look up by currency code so adding a market later is data, not code.)

---

## Build plan

**Estimated effort: ~6–7 hr of code.** Ordered so each step can be tested in isolation before the next.

### 1. Database (~30 min)

- New table `country_shipping_rates`:
  - `country` (text, PK)
  - `rate_per_gram_inr` (numeric, required)
  - `active` (bool, default true)
  - `notes` (text, nullable)
  - `created_at`, `updated_at`
- `orders` additions: `fx_rate_snapshot`, `subtotal_inr`, `shipping_fee_inr`, `discount_total_inr`, `total_inr`. Existing amount fields (`subtotal`, `shipping_fee`, `discount_total`, `total`) hold the buyer-currency view going forward.
- `products.net_weight_g`: stays nullable in the DB; app enforces required.

### 2. Backend (~2 hr)

- `/api/checkout/calc-totals`:
  - Read visitor country.
  - **India**: existing flow unchanged.
  - **International**: validate every product has `net_weight_g`; reject with `MISSING_PRODUCT_WEIGHT` if not. Look up `country_shipping_rates.rate_per_gram_inr`; compute `shipping_fee_inr = total_grams × rate`. Convert totals to buyer currency using current `currency_rates` row; return both views + the rate snapshot.
  - Drop `MIXED_CURRENCY_NOT_SUPPORTED` guard.
- `/api/razorpay/create`: pass buyer currency to Razorpay; use exponent-table multiplier for `amount`. Persist `fx_rate_snapshot` + INR-equivalent fields on the order.
- `/api/razorpay/verify`: replace every hardcoded `₹` / `INR` in emails with `formatPrice(amount, order.currency)`. Emails stay in English.
- `/api/international-order`: leave the code in place for one release as a safety net; cart UI no longer routes to it.

### 3. Admin (~1 hr)

- **Settings → International Shipping**: per-country table with `rate_per_gram_inr` + active toggle. Inline edit, country list pulled from `lib/countries.ts` minus IN.
- **Product form**: weight becomes required to save. Inline hint: "Required for international shipping calculation."
- **Audit view**: list of published products missing `net_weight_g` so admin can backfill.
- **Orders list/detail**: render amounts in the order's currency with INR-equivalent on a secondary line.
- **Invoices**: currency-aware totals via the same formatter.

### 4. Storefront (~2 hr)

- Cart page: replace "Request International Order" CTA with native Razorpay checkout for non-IN visitors.
- Checkout:
  - Shipping line renders normally (no more "Quoted on request" for non-IN).
  - Customs disclosure shown above pay button: *"Customs duties and taxes are payable by you on delivery in your destination country."*
  - Non-IN address form is freeform (line1, line2 optional, city, postal code, country).
- K-Plus hidden when `country !== 'IN'`:
  - `/k-plus` returns 404 (or redirect home).
  - `KPlusPromoBanner` returns null.
  - Account → K-Plus section hidden.
  - Cart/checkout K-Plus benefit labels suppressed.
- Currency switching mid-checkout re-quotes totals (re-call `/api/checkout/calc-totals` so the displayed price always matches Razorpay).

### 5. Testing (~1 hr)

- **India regression**: existing cart → payment → email flow unchanged.
- **International happy path**: USD test card in Razorpay sandbox → confirm exponent, totals, FX rate snapshot persisted, emails.
- **Zero-decimal sanity**: one VND test order to confirm the ×1 multiplier path.
- **K-Plus invisibility**: non-IN session has no K-Plus surfaces; IN session unchanged.
- **Weight enforcement**: admin can't save a product without weight; calc-totals refuses international carts with weightless products.

---

## Your-side prerequisites (Razorpay dashboard / merchant tasks)

- **Apple Pay domain verification** for production domain in the Razorpay dashboard.
- Confirm the international MDR Razorpay quoted so we can document it.
- Run the products-missing-weight count before we flip the required flag (the only blocking-data dependency).

---

## Out of scope (deferred)

| Item | Why deferred |
|---|---|
| Per-market price points (model B/C) | Daily FX is acceptable for v1; switch later without re-doing plumbing. |
| Order email localization | English-only locked in v1; covered by MULTILANGUAGE.md Phase 2.5 candidate. |
| VAT / sales tax calculation | DDU model accepted; no merchant-side calculation needed. |
| Per-country address regex / postal validation | Freeform v1; revisit if customs returns spike. |
| Postal-code-aware shipping (zones, courier integration) | Single flat rate per country covers the model; courier API integration is a separate phase. |
| Currency-specific promo codes | Promo cap percentage is currency-agnostic; fixed-amount codes (if introduced later) need currency awareness. |

---

## Migration / rollback notes

- DB additions are additive. New columns on `orders` nullable; new `country_shipping_rates` table is new.
- If we need to roll back: clear `country_shipping_rates`, revert the calc-totals branch (early-return international carts to manual-quote path), revert cart-page CTA. The Razorpay create/verify changes are backward-compatible because they read `order.currency` which defaults to INR.
- Apple Pay can be toggled off in Razorpay independently; nothing in our code is Apple-Pay-specific.

---

## Files this will touch (anticipated)

- `app/api/checkout/calc-totals/route.ts`
- `app/api/razorpay/create/route.ts`
- `app/api/razorpay/verify/route.ts`
- `app/checkout/checkout.tsx`
- `app/cart/page.tsx`
- `components/InternationalOrderModal.tsx` (route cart away from it for supported currencies)
- `components/KPlusPromoBanner.tsx` (gate on country)
- `app/k-plus/page.tsx` (gate on country)
- `app/admin/settings/page.tsx` (add international shipping section)
- `components/admin/ProductForm.tsx` (weight required)
- `lib/currency.ts` (Razorpay exponent table helper)
- `lib/membership.ts` (skip K-Plus benefits for non-IN)
- New: `supabase/migrations/<date>_international_payments.sql`
- New: admin shipping rates page route + API

---

## Deferred: K-Partnership (influencer / referral) currency handling

**Status**: spec only. Bugs are live; flagged 2026-05-16 during the international payments testing pass. Not blocking — only bites the first international order that redeems an influencer promo. Fix when ready.

### What's wrong

Two coupled defects, both produced by the Phase 2 cutover where `orders.subtotal` etc. switched from canonical-INR to buyer-currency:

#### Bug 1: commission is recorded in the buyer's currency, not INR

[app/api/razorpay/verify/route.ts](app/api/razorpay/verify/route.ts) line ~311:
```ts
const base = money(order.subtotal);                  // ← buyer currency (USD/EUR/etc) post-Phase-2
const commissionAmount = base * (commissionPct / 100); // ← buyer currency
```

The `order_attributions` row written here uses `currency = orderCurrency`, so a USD order ends up with `commission_amount = $X, currency = 'USD'`. That's technically internally consistent, but it's wrong for the merchant: payouts to influencers come out of the **India settlement account in INR**. Storing commission in USD/EUR forces a payout-time FX conversion at a worse rate than what was earned, and leaves the merchant carrying the FX risk.

#### Bug 2: dashboard sums add commission_amount across currencies

Both [app/api/me/summary/route.ts](app/api/me/summary/route.ts) (`lifetime_commission`, `approved` totals) and [app/api/me/request/route.ts](app/api/me/request/route.ts) (`computeAvailable`) do:
```ts
rows.reduce((sum, r) => sum + Number(r.commission_amount || 0), 0);
```

No group-by-currency, no conversion. After one international conversion the dashboard reads `₹1,000 + $10 = "₹1,010"` — silently undercounts the foreign commission by ~99×. Same math feeds the "available to withdraw" gate on payout requests, so an influencer could be quoted the wrong withdrawable amount.

### Recommended fix

**Single-point fix**: switch the commission calc in verify from buyer-currency to INR canonical. Once that's done, the dashboard sums and payout availability become correct automatically because all rows are in the same currency.

```ts
// app/api/razorpay/verify/route.ts (commission block)
const baseInr = money(Number(order.subtotal_inr ?? order.subtotal));
const commissionAmount = money(baseInr * (commissionPct / 100));

// And in the order_attributions insert/update calls,
// override `currency: orderCurrency` → `currency: 'INR'`.
```

The `subtotal_inr` column was added in [supabase/migrations/20260516_international_payments_phase1.sql](supabase/migrations/20260516_international_payments_phase1.sql) and is populated by `razorpay/create` for every new order. For legacy rows where it's null, the fallback `?? order.subtotal` is the right value because legacy orders had INR subtotals.

### Backfill for orders placed since the Phase 2 cutover

Any orders placed between Phase 2 ship date and the fix date with attribution + non-INR currency need rebasing. One-shot SQL:

```sql
-- Convert post-Phase-2 international commission rows back to INR.
-- The fx_rate_snapshot on each order is `rate_from_inr` at order
-- time, so dividing the buyer-currency commission by it yields INR.
update public.order_attributions oa
set
  commission_amount = round((oa.commission_amount::numeric / o.fx_rate_snapshot::numeric)::numeric, 2),
  currency = 'INR'
from public.orders o
where oa.order_id = o.id
  and o.currency <> 'INR'
  and o.fx_rate_snapshot is not null
  and o.fx_rate_snapshot > 0
  and oa.currency <> 'INR';

-- Sanity check: returns 0 rows if the backfill is complete.
select count(*) from public.order_attributions oa
  join public.orders o on o.id = oa.order_id
  where o.currency <> 'INR' and oa.currency <> 'INR';
```

### What works correctly today (don't accidentally break)

The audit found these parts of the K-Partnership flow already handle international orders fine — only the commission accounting is wrong:

- `/influencer-request` (apply form) — locale-agnostic, no gating needed
- `/r/[code]` + `/rl/[id]` link tracking — locale-agnostic
- Promo / referral code entry in cart — `calc-totals` applies the percent before FX, conversion happens after
- 25% global cap enforcement — currency-agnostic percent math
- `order_attributions` row creation on `razorpay/create` — happens for INR + intl alike
- Influencer dashboard per-row currency display — uses `toINR(amount, currency)` which renders each row in its own currency

### Out of scope for this fix

| Item | Why deferred separately |
|---|---|
| International influencer banking (SWIFT/IBAN fields, cross-border payouts) | Currently we only payout to Indian accounts (UPI / IFSC). A non-IN influencer applying via `/influencer-request` has no payout path that works. Bigger product decision. |
| Translating the influencer dashboard | Static UI strings are partially covered by Phase 2.2; commission help text + tooltips still assume INR. Low priority — most international visitors don't reach the dashboard. |
| Per-currency payout buckets | If we ever want to pay influencers in their own currency (vs INR), a `payout_currency` column on `influencer_payouts` + per-currency wallet balances would be needed. Big design change. |

### Effort to close

- **Code fix**: ~20 min (verify route + two attribution write sites).
- **Backfill**: ~5 min (one SQL block, idempotent).
- **Verification**: ~15 min — place an INR test order with an influencer promo, then a USD test order with the same promo, confirm both commission rows are in INR and the dashboard `lifetime_commission` sum matches `subtotal_inr × commission_pct / 100` for each.

**Risk**: low — fix is local to one file path; the backfill is reversible (multiply back by fx_rate_snapshot) if something goes wrong; existing INR commissions are untouched.
