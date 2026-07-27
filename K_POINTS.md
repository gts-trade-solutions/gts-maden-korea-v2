# K-Points — Reward Points System (Spec)

Status: **spec locked pending build**. Last updated 2026-07-24.

K-Points is MadeNKorea's customer reward-points currency. Customers **earn**
K-Points from activity, **spend** them for discounts and to access the skin
analyzer, and can **buy** them with money. Every economic value is
**admin-configurable** — no rates are hardcoded.

Companion of [CLAUDE.md](CLAUDE.md). Grounded in the real payment/pricing flow —
read the "Payment-flow landmines" section before touching checkout.

---

## 1. Principles

- **Event-sourced ledger is the source of truth**; a per-user balance row is a
  rebuildable cache. Every mutation is idempotent (unique key per source event)
  and transactional (compare-and-set on a balance `version`, mirroring the
  `SkinEntitlement` pattern).
- **One global integer balance per user** (K-Points are currency-agnostic). The
  currency valuation only applies at the *moment* of earn / redeem / buy.
- **INR-canonical order math.** Orders already persist buyer-currency AND INR
  (`discount_total` + `discount_total_inr` + `fx_rate_snapshot`); redemption
  follows the same dual-write.
- **Admin sets everything**: earn value per method, redemption value + caps,
  per-currency point values, buy-packs, skin-analyzer cost, expiry.
- **Login required** — guests have no K-Points.

## 2. Naming & identity

- Display name: **K-Points**. Table prefix: `k_points_*`. User key:
  `user_id Char(36)` (= `auth_users.id` = `profiles.id`), loose-indexed, no FK.

## 3. Data model (new tables)

- **`k_points_ledger`** (append-only, truth):
  `id`, `user_id`, `delta` (+earn / −spend, integer points), `reason`
  (`purchase | signup | review | referral | redeem | buy | admin_grant |
  skin_access | expiry | reversal`), `source_type`, `source_id`, `status`
  (`available | reserved | settled | reversed | expired`), `expires_at?`,
  `meta Json?`, `created_at`.
  **Unique idempotency key** `@@unique([source_type, source_id, reason])`.
- **`k_points_balance`** (per-user cache): `user_id` PK, `available`,
  `reserved`, `lifetime_earned`, `lifetime_spent`, `version` (CAS),
  `updated_at`.
- **`k_points_currency_rates`** (valuation, see §4): `currency_code` PK,
  `points_per_unit` (how many points = 1 unit of this currency), `is_auto`
  (derived from base vs manual override), `updated_at`.
- **`k_points_rules`** (per-action earn config): `action_key`
  (`purchase | signup | review | referral`), `mode` (`percent | flat`),
  `value` (percent of eligible spend, or flat points), `enabled`, `one_time`,
  `updated_at`.
- **`k_points_packs`** (buy-with-money catalog): `id`, `points`, `price_base`
  (in base currency), `active`, `position`. Per-currency price derived from the
  currency rates (overridable later if needed).
- **`k_points_purchase_orders`** (buy flow, mirrors `payment_orders`): `id`,
  `user_id`, `pack_id`, `points`, `amount`, `currency`, `razorpay_order_id`,
  `status`, `created_at`, `paid_at?`.
- **Global config** on the `store_settings` singleton (or a `k_points_settings`
  singleton): `base_currency` (default `USD`), `base_points_per_unit`
  (default `500` → 500 K-Points = 1 USD), `redeem_cap_percent` (max % of an
  order payable by points), `redeem_min_points`, `points_expiry_days`,
  `skin_analyzer_cost_points`, `earn_on_net` (bool, default true).

New **order columns** (migration): `points_redeemed_amount` (₹, INR canonical),
`points_redeemed_qty` (points), `points_earned`, `order_kind`
(`product | points_purchase`).

## 4. Currency-aware valuation

A single global setting anchors everything: **base currency = USD**,
**base rate = 500 K-Points per 1 USD** (i.e. 500 pts ≡ $1).

`k_points_currency_rates` holds `points_per_unit` for every supported currency:
- **USD**: 500 (the base).
- **Others (auto)**: derived from the base via the app's live FX so value stays
  consistent — e.g. if $1 = ₹83, INR `points_per_unit` = 500 / 83 ≈ 6.02
  (so 500 pts ≡ ₹83 ≡ $1). Stored with `is_auto = true`.
- **Override**: admin can set any currency's `points_per_unit` manually
  (`is_auto = false`) — e.g. make 500 pts ≡ ₹80 in India as a market lever.

Admin actions:
1. **Change base currency + base rate.**
2. **Auto-convert** — recompute every `is_auto` currency from the base using FX.
3. **Edit one currency** — override its rate (marks it non-auto).

Where valuation is used:
- **Redemption**: buyer-currency discount = `points ÷ points_per_unit(buyerCcy)`;
  converted to INR canonical (fx snapshot) for the charge, dual-written on the
  order.
- **Purchase earn** (`percent` mode): `pointsEarned =
  round(netPaid_buyerCcy × earn% × points_per_unit(buyerCcy))`.
- **Buy-packs**: pack `price` per currency derived from `points ÷
  points_per_unit(ccy)` (or the pack's `price_base` converted).
- **Flat earns** (signup, review, referral bonuses) and **skin-analyzer cost**
  are fixed point amounts — currency-independent.

## 5. Earn (all values admin-set; ranges enforced in admin UI)

| Action | Hook (file) | Idempotency | Mode |
|---|---|---|---|
| **Purchase** | `app/api/razorpay/verify/route.ts` (paid block) | per `order_id` | percent of net INR paid (default earn on net, excludes points-paid portion) |
| **Signup** | `app/api/auth/register/route.ts` | per `user_id` | flat, one-time |
| **Product review** | on **approval / publish** (admin), not on create | per `review_id` | flat, one per product |
| **Referral (referred buyer)** | `verify` attribution block | per `order_id` | flat or percent |
| **Admin manual grant** | admin console | per grant id | arbitrary +points, with reason |

Removed per decision: ~~skin-analysis completion~~, ~~K-Plus purchase~~.
Abuse-prone surfaces (wishlist / add-to-cart) intentionally excluded.

## 6. Spend

- **Checkout redemption (primary):** apply K-Points → currency discount, capped
  at `redeem_cap_percent` of the **product cost** (subtotal − promo discount).
  **Shipping is always paid in full** — K-Points never offset the shipping fee.
  See §8 for the reserve→settle→release wiring.
- **Skin analyzer access (NEW — see §9):** the analyzer is **no longer free**.
  Each analysis costs `skin_analyzer_cost_points`, spent to unlock access.
- **Free shipping redemption** (optional, admin toggle) — a fixed points cost to
  waive shipping on an order.
- Removed per decision: ~~pay for K-Plus with points~~.
- Later/optional: exclusive or early-access products gated by points.

## 7. Buy K-Points with money

A **separate Razorpay flow** mirroring K-Plus membership (does NOT touch the
cart/order pipeline):
- `POST /api/points/purchase/create` — pick a `k_points_packs` row, create a
  Razorpay order for the pack price in the buyer currency, tag
  `notes.type = "points_purchase"`, write `k_points_purchase_orders`.
- `POST /api/points/purchase/verify` — HMAC-verify signature, then
  `earn(reason: "buy")` idempotent per purchase-order id.
- Purchased points are spendable like earned ones and count toward the same
  redemption caps, but **do not earn further points** (no compounding) and
  follow the same expiry.

## 8. Checkout redemption integration — payment-flow landmines

Two facts about the existing payment path dictate the design:

1. **`razorpay/verify` recomputes discount + total from *percentages*** and uses
   Razorpay's `amount_paid` — it ignores stored discount amounts. A fixed
   points redemption therefore **cannot** ride the promo pipeline; it must be
   **persisted on the order at create time** and **re-read** in verify.
2. **`razorpay/create` builds the charge from the persisted order totals** — the
   points discount must already be written into the order's
   `discount_total`/`total` **before** create runs.

Flow (reserve → settle → release):
1. `calc-totals` returns a `points_redeemable_max` + shows the discount for a
   requested redeem amount (display only).
2. **Order create** (`app/api/orders/create` → `lib/data/orders.ts`):
   `reserve()` the points (ledger row `status: reserved`, balance
   `available→reserved`), write `points_redeemed_qty` +
   `points_redeemed_amount` (INR) + reduce `discount_total`/`total` on the order.
3. `razorpay/create` charges the reduced total.
4. `razorpay/verify` on success: read the stored redeemed amount (NOT recompute),
   `settle()` the reservation (`reserved→settled`, balance `reserved` cleared,
   `lifetime_spent += qty`), then `earn()` purchase points on the net paid.
5. On cancel / failure / TTL expiry: `release()` the reservation
   (`reserved→reversed`, points returned to `available`).

## 9. Skin analyzer: free → points-gated

Today `/api/skin/start` reserves a free `SkinEntitlement`
(`available→reserved→consumed`, `source: free|granted`). Change:
- Accessing an analysis now **spends `skin_analyzer_cost_points`**. On start:
  check balance → `spend(reason: skin_access)` → grant the entitlement → mint
  the handoff. Insufficient balance → prompt to earn / buy K-Points.
- The old "first one free" is removed; admin can still **grant** free access
  manually (entitlement `source: granted`) for comps/support.
- The existing "request another analysis" flow is replaced by "spend K-Points to
  unlock an analysis."

## 10. Admin console — `/admin/k-points`

Built on the skin-recommendations admin pattern (settings table + `requireAdmin`
API + client page + card on `/admin`). Sections:
- **Economics**: base currency + base rate; per-currency `points_per_unit` table
  with auto-convert + manual override; redeem cap/min; expiry; earn-on-net; skin
  analyzer cost.
- **Earn rules**: per-action mode/value/enabled/one-time (`k_points_rules`).
- **Buy packs**: CRUD on `k_points_packs`.
- **Users**: search by email/name → view balance + ledger; **give points
  directly** (manual grant/deduct with reason).

APIs under `app/api/admin/k-points/*`, each `requireAdmin`-guarded.

## 11. Customer surfaces

- **Header chip**: live K-Points balance shown in the header for logged-in users
  (like the cart count), linking to the account rewards page.
- **Account page** `/account/k-points`: balance, ledger history, expiring-soon,
  "how to earn," buy-points, redeem info.
- **Landing page** `/k-points`: a dedicated marketing page explaining earning,
  spending, buying, and skin-analyzer access — built like the `/skin-analyzer`
  and `/k-plus` landing pages.
- **Checkout**: redemption widget wired to §8.

## 12. Analytics

Whitelist new events in `lib/analytics/events.ts`: `points_earned`,
`points_redeemed`, `points_purchased`, `points_skin_access`. Purchase/redeem/buy
fire server-side in the relevant verify routes (guaranteed), like `order_placed`.

## 13. Phasing (each shippable)

1. **Foundation + earning** ✅ **BUILT (Phase 1)** — tables + migration
   (`db/migrations/20260724_k_points.sql`), `lib/k-points/` (`config.ts`,
   `service.ts`, `constants.ts`: idempotent `earn`/`adminAdjust`/`getBalance`/
   `getLedger`, currency valuation + auto-convert), admin console `/admin/k-points`
   (+ `/api/admin/k-points/{config,rules,rates,users}`), account page
   `/account/k-points` + `/api/me/k-points` + header balance chip
   (`components/KPointsHeaderChip.tsx`), landing `/k-points`, earn-on-purchase
   (`razorpay/verify`) + signup bonus (`auth/register`), analytics events
   whitelisted. Reserve/settle/release are stubbed for Phase 2.
2. **Checkout redemption** ✅ **BUILT (Phase 2)** — order columns
   (`points_redeemed_amount`/`_qty`, `points_earned`, `order_kind`;
   `db/migrations/20260724_k_points_order_columns.sql`), `reserve`/`settle`/
   `release`/`releaseExpiredReservations` + `computeRedeemQuote` in the service,
   `calc-totals` redemption preview, `orders/create` reserve+persist,
   `razorpay/create` charges the reduced total (reads `points_redeemed_amount`),
   `razorpay/verify` settles on paid, cron `/api/cron/k-points-release` for
   abandoned holds, and the checkout redemption widget. Also: **signup backfill**
   (existing users retro-credited when the signup bonus is enabled; idempotent).
3. **Buy K-Points** ✅ **BUILT (Phase 3)** — `k_points_packs` +
   `k_points_purchase_orders` (`db/migrations/20260724_k_points_packs.sql`),
   `/api/points/purchase/{create,verify}` (Razorpay, mirrors K-Plus), public
   `/api/points/packs`, admin packs CRUD (`/api/admin/k-points/packs` + admin UI
   section), and the customer buy UI (`components/k-points/BuyKPoints.tsx`) on
   the account page. Purchased points earn `reason: "buy"`, don't compound.
4. **Skin-analyzer gating + remaining earns** ✅ **BUILT (Phase 4)** —
   analyzer is points-gated when `skinAnalyzerCostPoints > 0`: `skin/start`
   spends K-Points to unlock a scan (admin grants still free; free first-scan
   only while cost is 0), `skin/status` surfaces cost+balance, and the
   `/skin-analyzer` CTA shows "Analyze — N K-Points" / "Get K-Points". Review
   earn credits on create for **verified purchases only** (no moderation
   workflow exists; move to approval if one is added). Referral earn credits the
   buyer on attributed orders in `verify`. Expiry cron
   `/api/cron/k-points-expire` (FIFO, balance-safe). Free-shipping redemption
   remains deferred.

Note: `spend()` (generic) added to the service for skin access; `expirePoints()`
and `releaseExpiredReservations()` back the two crons.

## 14. Deferred / open

- Exclusive/early-access products gated by points (future).
- Per-currency pack price overrides (start with base-derived).
- Points expiry notifications (email) — after core expiry cron.
