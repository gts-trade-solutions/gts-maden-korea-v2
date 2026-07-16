# K-Partnership (K-Partner) — Reference

Developer reference for the **K-Partnership** program — MadeNKorea's influencer /
referral partner system. Use this as the single source of truth when touching
partner signup, referral links, promo codes, commission attribution, payouts, or
the related admin screens. Last mapped 2026-07-16.

## Terminology (read this first)

The **customer-facing brand** is "K-Partnership" / "K-Partner" / "Become a
Partner." In **code**, everything is named `influencer_*` (tables, routes, RPCs)
plus `referral_*`, `promo_codes`, and `order_attributions`. There is **no
`commissions` table** — commission is the `order_attributions` ledger.

**Backend:** the stack is mid Supabase→MySQL migration. **MySQL via Prisma is the
source of truth.** Supabase is a legacy fallback behind
`process.env.CATALOG_BACKEND === "mysql"`, and several write paths dual-write to
both via `mirror*IntoMysql` helpers in [lib/data/influencer.ts](lib/data/influencer.ts).
When in doubt, trust the MySQL/Prisma path.

## Lifecycle at a glance

```
Apply ──► Admin approves ──► Partner gets links + promo codes ──► shares them
  │            │                                                       │
influencer_    creates influencer_profiles                       buyer uses code
requests       (active, cap%, default discount%, countries)           │
(pending)                                                              ▼
                                                          Razorpay verify writes
                                                          order_attributions (commission)
                                                                  │
                                          auto-approve now (days=0) OR cron after N days
                                                                  ▼
                                             approved commission ──► partner requests
                                             (withdrawable)          payout ──► admin
                                                                     settles manually
```

## 1. Signup / application flow

| Piece | File | Notes |
|---|---|---|
| Public landing ("Become a Partner") | [app/influencer-request/page.tsx](app/influencer-request/page.tsx) | Explainer video (`/api/catalog/k-partnership-video?country=XX`), FAQ, application form. Captures **`handle`** + **`note`** only. Reads state from `GET /api/influencer/status`. Anonymous can browse; sign-in forced on "Become a Partner" click. |
| Registration hint | [app/auth/register/register.tsx](app/auth/register/register.tsx) | `?mode=influencer` routes to `/influencer-request` after signup. No partner data captured at registration. |
| Submit application | [app/api/influencer/request/route.ts](app/api/influencer/request/route.ts) (POST) | Gated on `requireEmailVerified`. Rejects if already an active profile or a pending request. Inserts `influencer_requests {user_id, handle, note, social, status:"pending"}`, mirrors to MySQL, fires admin bell (`kpartnership_requested` → `/admin/influencers`). |
| Alternate submit | [app/api/influencer/apply/route.ts](app/api/influencer/apply/route.ts) (POST) | Older path via `request_influencer` RPC. Same table. |
| Status read | [app/api/influencer/status/route.ts](app/api/influencer/status/route.ts) (GET) | Returns `admin` \| `influencer` \| `pending` \| `rejected` \| `none`. |

**States:** `influencer_requests.status` = `pending` → `approved` \| `rejected`
(re-application allowed after rejection). **Approval creates the
`influencer_profiles` row**; rejection does not.

## 2. Partner dashboard (`app/influencer/*`)

Gate: [app/influencer/layout.tsx](app/influencer/layout.tsx) — NextAuth session
required; admins pass (admin-mode badge); non-admins need an **active**
`influencer_profiles` row or get redirected to `/influencer-request`. Noindexed.

| Route | Purpose |
|---|---|
| [app/influencer/page.tsx](app/influencer/page.tsx) | Main dashboard. Source-of-truth **create/edit/delete promo** card, wallet-connect modal, payout-request modal, stat tiles (lifetime commission, available to withdraw). Loads `/api/me/summary`, `/api/me/wallet`, `/api/influencer/promos`, `/api/me/display-currency`. |
| [app/influencer/links/page.tsx](app/influencer/links/page.tsx) | Referral-link generator → share URL `${origin}/r/{handle}?p={slug}`. |
| [app/influencer/payouts/page.tsx](app/influencer/payouts/page.tsx) | Payout history from `/api/me/payouts`. |
| `app/influencer/promos/page.tsx` | Retired — permanent redirect to `/influencer`. |

**Dashboard APIs:**

- [app/api/me/summary/route.ts](app/api/me/summary/route.ts) — `lifetime_commission`, `available_to_withdraw` = approved commissions − (pending+paid payouts), plus `commission_cap_pct`, `default_user_discount_pct`, `applicable_countries`.
- [app/api/me/wallet/route.ts](app/api/me/wallet/route.ts) — payout-method wallet stored as `influencer_profiles.payout_meta` JSON (`save_my_wallet_meta` RPC). UPI / Indian bank / intl bank / PayPal / Wise + `preferred_method`. **Informational only** — admin wires money manually.
- [app/api/me/payouts/route.ts](app/api/me/payouts/route.ts) (list) · [app/api/me/payouts/request/route.ts](app/api/me/payouts/request/route.ts) (POST withdrawal — recomputes available server-side, inserts `influencer_payouts {status:"initiated", currency:"INR"}`, emails admin). A duplicate/older variant exists at [app/api/me/request/route.ts](app/api/me/request/route.ts).
- [app/api/influencer/promos/route.ts](app/api/influencer/promos/route.ts) (GET/POST) + [app/api/influencer/promos/[id]/route.ts](app/api/influencer/promos/) (PATCH/DELETE) — create validates `user% + commission% ≤ commission_cap_pct` (`SPLIT_EXCEEDS_CAP`), requires finalized cap (`SETTINGS_NOT_FINALIZED`), globally-unique code (`CODE_ALREADY_TAKEN`). **Global promos only** (`product_id IS NULL`).
- [app/api/influencer/links/route.ts](app/api/influencer/links/route.ts) (list) · [app/api/influencer/timeseries/route.ts](app/api/influencer/timeseries/route.ts) (daily clicks + orders).

## 3. Referral links, redirects & cookies

- [app/r/[code]/route.ts](app/r/) (GET, Node) — **main referral entry.** Sets HTTP-only cookie `mi_ref_code` for `REF_ATTRIBUTION_DAYS` (default 30) days, resolves `code` → `referral_links` (Prisma), logs a `referral_clicks` row (fire-and-forget), redirects: `link_type==="product"` → `/products/{slug}`, else `/`. Dashboard links use the influencer **handle** as `[code]` + `?p=slug`.
- [app/rl/[id]/page.tsx](app/rl/) — alternate redirect by referral-link **id**; logs a click; redirects to `?to=`.
- `supabase/functions/log-referral-click` — legacy edge function, **superseded** by the inline Prisma writes above.
- [lib/promo-cookie.ts](lib/promo-cookie.ts) — promo cookie (name `promo_code`, 7-day, uppercased). Consumed by checkout calc-totals.
- [lib/referral/constants.ts](lib/referral/constants.ts) — `REF_COOKIE="mi_ref_code"`, `PROMO_COOKIE="mi_promo_code"`, `ATTRIBUTION_DAYS`.

> ⚠️ **Cookie-name inconsistency** (carry-over debt): `lib/promo-cookie.ts` uses
> `"promo_code"`, `lib/referral/constants.ts` uses `"mi_promo_code"`, and
> `app/r/[code]` uses `"mi_ref_code"`. Check which one a given path reads before
> relying on it.

**Mapping:** referral code → `referral_links.code` → `influencer_id`; promo code
→ `promo_codes.code` → `influencer_id`. Both carry `discount_percent`,
`commission_percent`, `cap_percent`.

## 4. Commission / attribution

- **Attribution write:** [app/api/razorpay/verify/route.ts](app/api/razorpay/verify/route.ts) — on payment verify, resolves influencer/promo from `orders.promo_code_id` → `orders.promo_snapshot` → Razorpay `notes`. **Commission is INR-canonical:** `commissionAmount = money(subtotal_inr * commissionPct/100)` (payouts always settle in INR). Reads `store_settings.commission_auto_approve_days`: `0` → attribution `status:"approved"`; `N` → `"pending"`. Writes via `upsertOrderAttribution` ([lib/data/payments.ts](lib/data/payments.ts)); increments `promo_codes.uses`.
- **Checkout math (active):** [app/api/checkout/calc-totals/route.ts](app/api/checkout/calc-totals/route.ts) — promo via `getPromoCodeFromCookie()` → `getPromoDetailsMysql`; cap via `getInfluencerCapMysql` (`influencer_profiles.commission_cap_pct`) + region allow-list (drops promo silently if buyer country not allowed). **Split per line:** `effComm = min(promo.commission%, cap)`, then `effUser = max(0, min(promo.user_discount%, cap − effComm))`. `promo_exempt` products skip. Returns `discount_total`, `commission_total`, per-line effective percents.
- **Legacy checkout:** [app/(checkout)/actions/calcTotals.ts](app/(checkout)/actions/) (Supabase `validate_promo`/`get_referral_context`) — **superseded** by the API route.
- **Auto-approve setting:** [app/api/admin/settings/commission-auto-approve/route.ts](app/api/admin/settings/commission-auto-approve/route.ts) — `store_settings.commission_auto_approve_days`, bounds **0–90**.
- **Cron:** [app/api/cron/commission-approve/route.ts](app/api/cron/commission-approve/route.ts) (`CRON_SECRET` bearer) — flips `pending → approved` once `orders.paid_at ≤ now − N days`. No-op when days = 0.

## 5. Admin surface

- [app/admin/influencers/page.tsx](app/admin/influencers/page.tsx) — two tabs: **requests** (approve/reject with cap + default-discount + regions modal) and **payouts** (status, notes, settlement ref).
  - [app/api/admin/influencers/decision/route.ts](app/api/admin/influencers/decision/route.ts) — `approve` validates `cap` 5–100, `def` 0–cap; upserts `influencer_profiles {active:true, default_commission_percent:10, commission_cap_pct, default_user_discount_pct, applicable_countries}`. `reject` flips request.
  - [app/api/admin/influencers/[user_id]/route.ts](app/api/admin/influencers/) — revise cap / default discount / countries.
  - [app/api/admin/influencers/notify-decision/route.ts](app/api/admin/influencers/notify-decision/route.ts) — best-effort SES approve/reject email.
  - `app/api/admin/influencers/payouts/[id]/route.ts` — PATCH `{status, paid_at, settled_reference, notes}`.
- [app/admin/commissions/page.tsx](app/admin/commissions/page.tsx) — pending/approved/voided tabs, per-row approve/void, auto-approve-window editor. API: [app/api/admin/commissions/route.ts](app/api/admin/commissions/route.ts) (GET list / PATCH `{order_id, status}`).
- **K-Partnership CMS video:** [app/admin/cms/k-partnership-videos/page.tsx](app/admin/cms/k-partnership-videos/page.tsx) + [app/api/admin/k-partnership-videos/route.ts](app/api/admin/k-partnership-videos/route.ts) (per-country upload to `site-assets`/`k-partnership/`, default-country pointer) + public read [app/api/catalog/k-partnership-video/route.ts](app/api/catalog/k-partnership-video/route.ts). *(Separate from the homepage "shop-the-video" `home_influencer_videos` feature.)*

## 6. Database tables (`prisma/schema.prisma`)

| Table | Key columns |
|---|---|
| `influencer_requests` | `user_id` (unique), `handle?`, `social`, `note?`, `status` (pending/approved/rejected), `reviewed_by/at` |
| `influencer_profiles` | PK `user_id`; `handle` (unique), `default_commission_percent` (10.00), `active`, `payout_meta` json, `display_currency` (INR), **`commission_cap_pct`**, **`default_user_discount_pct`**, **`applicable_countries`** json |
| `influencer_payouts` | `influencer_id`, `amount`, `currency` (INR), `covering_orders` json, `status` (initiated/processing/paid/failed), `method`, `settled_reference`, `paid_at?` |
| `promo_codes` | `influencer_id`, `code` (unique), `product_id?`, `discount_percent`, `commission_percent`, `cap_percent`, `max_uses?`, `uses`, `active`, `scope` (global) |
| `referral_links` | `influencer_id`, `link_type`, `product_id?`, `code` (unique), `discount_percent`, `commission_percent`, `cap_percent`, `uses`, `active` |
| `referral_clicks` | `referral_id`, `clicked_at`, `viewer_user_id?`, `ip_hash?`, `meta?` |
| `order_attributions` | **PK `order_id`** (one per order); `influencer_id`, `referral_id?`, `promo_code_id?`, `attributed_by`, `commission_amount`, `currency` (INR), **`status`** (approved default), `user_discount_total`, `commission_total` — **the commission ledger** |
| `order_attribution_items` | per-line: `order_id`, `product_id`, `qty`, `unit_price`, `effective_user_discount_pct`, `effective_commission_pct`, `commission_amount` |
| `influence_caps` | PK `product_id`, `cap_percent` (20.00) — **per-product cap, NOT wired into checkout (deferred)** |
| `k_partnership_videos` | PK `country_code`, `storage_path` |
| `store_settings` | singleton `id=1`: **`commission_auto_approve_days`** (0), **`k_partnership_default_country`** |

## 7. Business rules & constants

- **Default commission:** `influencer_profiles.default_commission_percent` = **10%** (seeded at approval). Checkout math uses the per-promo `commission_percent` + per-account `commission_cap_pct`, not this default.
- **Cap model:** the **only** cap enforced at checkout is per-influencer `commission_cap_pct` (admin-set integer **5–100**). The old global 25% constant is gone; per-product `influence_caps` (20%) is **deferred/unwired** (see comments in [app/api/checkout/calc-totals/route.ts](app/api/checkout/calc-totals/route.ts) lines ~30–37).
- **Split rule:** `user_discount% + commission% ≤ cap`. Commission takes priority: `effComm = min(promo.commission%, cap)`, then `effUser = min(promo.user_discount%, cap − effComm)`. Enforced on promo create/edit.
- **Applicable countries:** `influencer_profiles.applicable_countries` (ISO array; empty = all supported). Enforced at calc-totals and `/api/promo/apply` (drops promo silently if buyer country not listed). Validated via [lib/countries.ts](lib/countries.ts).
- **Currency:** commission ledger + payouts are **always INR** (`subtotal_inr`), regardless of buyer currency; storefront converts at render.
- **Auto-approve window:** `commission_auto_approve_days` (0–90, default 0). `0` = approved instantly at Razorpay verify; `N` = pending until the cron flips it after `paid_at + N days`. **Only `approved` commissions are withdrawable.**
- **Attribution windows:** referral cookie `REF_ATTRIBUTION_DAYS` (default 30 days); promo cookie 7 days.
- **Payout flow:** partner requests → `influencer_payouts` (`initiated`) → admin settles **manually offline** and records `settled_reference` → status `paid`. `available = approved commissions − (pending + paid payouts)`.

## 8. Shared helpers & env vars

**Helpers to reuse:** [lib/data/influencer.ts](lib/data/influencer.ts) (`*Mysql`
reads + `mirror*IntoMysql` dual-writes), [lib/data/payments.ts](lib/data/payments.ts)
(`upsertOrderAttribution`), [lib/data/checkout.ts](lib/data/checkout.ts)
(`getPromoDetailsMysql`, `getInfluencerCapMysql`),
[lib/auth/adminGuard.ts](lib/auth/adminGuard.ts) (`requireAdmin`),
[lib/admin/notifications.ts](lib/admin/notifications.ts) (`createAdminNotification`).

**Env vars:** `CATALOG_BACKEND` (`mysql` toggle), `REF_ATTRIBUTION_DAYS`,
`CRON_SECRET`, `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`, `SES_REGION`,
`SITE_URL`/`NEXT_PUBLIC_SITE_URL`, S3 `site-assets` bucket.

## 9. Gotchas

- **Two payout-request routes** exist (`/api/me/payouts/request` and `/api/me/request`) — prefer the former.
- **Two checkout math paths** — the Supabase server action is legacy; the API route is production.
- **`influence_caps` is dead weight** until wired — don't assume per-product caps apply.
- **Cookie-name drift** across the three referral/promo cookie definitions (see §3).
- Everything is `influencer_*` in code — search that, not "kpartner", when hunting for logic.
