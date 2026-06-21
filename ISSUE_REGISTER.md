# Made in Korea - Enriched Issue Register

Document type: Deep-dive issue register  
Source: Earlier application audit provided by the project owner  
Created: 2026-04-24  
Status: Includes original issue detail plus validated fix status from the 2026-04-24 updated report.

> **Related document — [DISCOVER_BACKLOG.md](DISCOVER_BACKLOG.md)**
>
> The Discover bento-grid feature has its own backlog file with its own
> ID space (`DISC-A1` … `DISC-H4`). Items scoped to that feature live
> there, not here. Don't confuse this register's `C-NN` / `M-NN` /
> `N-NN` IDs (Critical / Moderate / Minor app-wide audit findings) with
> Discover's `DISC-X` IDs.

## Purpose

This register exists so engineering, product, and operations can understand why each issue matters, how it is encountered, and what should be checked before implementation. It is a planning document, not proof that every issue still exists in the current codebase.

## Confidence Markers

- `[VERIFIED-DB]` - checked against the live Supabase database during the earlier audit.
- `[VERIFIED-CODE]` - checked against source code during the earlier audit.
- `[INFERRED]` - reasoned from observed implementation patterns; spot-check before fixing.
- `[UNVERIFIED]` - carried from early notes; treat as a lead, not proof.

## Issue Fields

Where available, each issue tracks:

- What is happening.
- Why it matters.
- How a customer or attacker encounters it.
- Likely root cause.
- Blast radius.
- Confirmation steps.
- Recommended fix.
- Follow-on work.
- Confidence level.

## Validation Update - 2026-04-24

Validated against: `madenkorea-gts-main` codebase as uploaded.  
Source: `madenkorea_Issue_Report.txt`, handoff notes, and the "Issue Report (Validated & Updated)" document provided on 2026-04-24.

### Executive Summary

| Bucket | Count | Meaning |
|---|---:|---|
| Confirmed solved | 34 | Safe to remove from the open remediation list after local re-check if needed. |
| Claimed solved but still broken | 3 | Must go back onto the open list. |
| Partially solved | 5 | Work was done, but issue is not fully closed. |
| Still open from original report | About 40 | Not listed as solved in the validated update. |
| Withdrawn | 1 | C-35 remains withdrawn. |

Note: the table above reflects the 2026-04-24 validation report at the time it was received. The Quick-Fix Batch sections below are newer and supersede those counts for the items they mark `SOLVED_AFTER_VALIDATION`.

### Implementation Update - 2026-04-24 Quick-Fix Batch

The following five items were fixed in this working tree after the validation report was added:

| ID | New status | Implementation notes |
|---|---|---|
| C-01 | `SOLVED_AFTER_VALIDATION` | Cart product image/title links now use `/products/${slug}` with `"#"` fallback when slug is missing. |
| C-12 | `SOLVED_AFTER_VALIDATION` | Brand placeholder fallbacks now use existing `/placeholder.png` instead of missing `/placeholder.svg`. |
| M-08 | `SOLVED_AFTER_VALIDATION` | Vendor dashboard support email changed from `support@madeinkorea.in` to `support@madenkorea.com`. |
| M-30 | `SOLVED_AFTER_VALIDATION` | Review deletion now asks for confirmation before deleting. |
| N-01 | `SOLVED_AFTER_VALIDATION` | Header desktop nav and mobile menu now include a `/contact` Support link. |
 
These items should no longer be treated as open unless later testing finds a regression.

### Implementation Update - 2026-04-24 Quick-Fix Batch 2

The following approved low-effort items were fixed or verified as already fixed in this working tree:

| ID | New status | Implementation notes |
|---|---|---|
| N-20 | `SOLVED_AFTER_VALIDATION` | Review title placeholder is already neutral: `Add a short summary`; no `Great product!` placeholder remains in the product review form. |
| N-16 | `SOLVED_AFTER_VALIDATION` | Checkout contact/shipping fields now include browser autofill hints, including `postal-code`, `street-address`, `address-level1`, `address-level2`, `email`, `tel`, and `name`. |
| M-14 | `SOLVED_AFTER_VALIDATION` | Login password visibility control is already click-to-toggle only; no mouse/touch press handlers remain. |
| M-12 | `SOLVED_AFTER_VALIDATION` | Checkout phone has JS validation and now also has HTML pattern/title validation for 10-digit Indian mobile numbers starting with 6-9. |
| M-26 | `SOLVED_AFTER_VALIDATION` | Cart order summary already renders `loadingTotals` with a spinner, opacity transition, and "Updating totals..." message. |
| M-29 | `SOLVED_AFTER_VALIDATION` | Review form already uses a full `submitting` state and disables Cancel/Submit while submitting. |
| N-07 | `SOLVED_AFTER_VALIDATION` | No live mock-data imports were found in `app/page.tsx`; only stale comments reference old mock sections. |

### Implementation Update - 2026-04-24 Quick-Fix Batch 3

The following approved low-effort items were fixed or verified as already fixed in this working tree:

| ID | New status | Implementation notes |
|---|---|---|
| C-16 | `SOLVED_AFTER_VALIDATION` | Vendor forgot-password link already points to `/auth/forgot`. |
| M-13 | `SOLVED_AFTER_VALIDATION` | Cart clear route now wraps `clear_my_cart` RPC in normal try/catch and falls back to table deletes without using typed `.catch()` on the Supabase query builder. |
| M-11 | `SOLVED_AFTER_VALIDATION` | Product review moderation already reads admin role from `profiles.role` instead of `session.user.app_metadata.role`. |
| M-10 | `SOLVED_AFTER_VALIDATION` | Registration already detects no-session signup and shows an email verification notice instead of falling through to sign-in. |
| M-24 | `SOLVED_AFTER_VALIDATION` | Cart already keeps unpublished/missing products visible as unavailable, excludes them from totals, disables quantity changes, and blocks checkout until removed. |
| M-27 | `SOLVED_AFTER_VALIDATION` | Product detail Add to Cart already has `isAddingToCart`, try/catch, disabled state, success toast, and error toast. |

### Implementation Update - 2026-04-25 Quick-Fix Batch 4

The following approved safer-subset items were fixed or verified in this working tree:

| ID | New status | Implementation notes |
|---|---|---|
| N-15 | `SOLVED_AFTER_VALIDATION` | Footer Threads URL is clean (`https://www.threads.com/@madenkorea_`) and contains no `xmt=` or personal tracking token. |
| C-19 | `SOLVED_AFTER_VALIDATION` | Contact page no longer renders the fake map/placeholder panel. It shows the env-driven address when configured and otherwise stays focused on support channels. |
| C-11 | `SOLVED_AFTER_VALIDATION` | Razorpay confirmation email already builds an absolute View Orders URL from `NEXT_PUBLIC_SITE_URL`, `APP_URL`, or the request origin. |
| C-20 | `SOLVED_AFTER_VALIDATION` | `/api/debug/whoami` was already production-gated; `/debug/whoami` is now also server-gated with `notFound()` in production, with the debug UI isolated in a development-only client component. |
| C-28 | `SOLVED_AFTER_VALIDATION` | `/product/[slug]` already redirects to `/products/[slug]` while preserving query params, so customers cannot reach the legacy "Share options coming soon" UI through the route. Full route cleanup remains tracked under M-17. |

### Implementation Update - 2026-04-25 Quick-Fix Batch 5

The following approved low-effort items were fixed or verified in this working tree:

| ID | New status | Implementation notes |
|---|---|---|
| M-28 | `SOLVED_AFTER_VALIDATION` | `ProductCard` already has `isAddingToCart`, try/catch, disabled state, success toast, and error toast for Add to Cart. |
| C-08 | `SOLVED_AFTER_VALIDATION` | Referral redirect helper already points product traffic to `/products/${slug}` instead of the degraded `/product/${slug}` route. |
| M-17 | `SOLVED_AFTER_VALIDATION` | The dead legacy product implementation file was removed. `/product/[slug]/page.tsx` remains only as a redirect shim to `/products/[slug]` for external/backward-compatible links. |
| M-16 | `SOLVED_AFTER_VALIDATION` | Obvious customer-facing store-brand copy was normalized to `MadenKorea` in footer alt text, Razorpay confirmation email copy, and influencer request copy. Remaining `Made in Korea` literals are product-origin/admin/mock-data labels rather than the store brand. |
| N-11 | `SOLVED_AFTER_VALIDATION` | `/services` was removed from both desktop and mobile consumer header navigation. The page can still exist for direct/B2B access, but retail shoppers are no longer sent there from the main nav. |
| N-03 | `SOLVED_AFTER_VALIDATION` | `/search` now uses the same `search_products_tsv` RPC as autocomplete, then loads full product-card records for the matched IDs while preserving RPC result order. |

### Implementation Update - 2026-04-27 Security Hardening Batch (Batch 8)

Live-applied four database/code fixes for the highest-severity items
flagged after Batch 7. C-39 receives a remediation checklist (rotation
must be done by the repo owner) and stays open until the git-history
scan + credential rotation is complete.

| ID | New status | Implementation notes |
|---|---|---|
| C-31 | `SOLVED` | Migration `block_non_admin_role_changes` applied. New `before update` trigger on `public.profiles` (`profiles_block_role_change`) raises an exception when a non-admin caller tries to change the `role` column. Service-role / direct-DB calls bypass the check (`auth.uid() is null` → allow) so admin tooling and migrations still work. Live verified via `pg_trigger`. Local file: `supabase/migrations/20260427_block_non_admin_role_changes.sql`. |
| C-40 | `SOLVED` | Migration `enable_rls_invoice_companies` applied. RLS enabled on `public.invoice_companies` plus an `admin all invoice_companies` policy gated by `public.is_admin()`. Account number / SWIFT code are no longer reachable through PostgREST without admin role. Verified `relrowsecurity = true`. The table is read/written exclusively by `/admin/invoices/*` pages. |
| C-41 | `SOLVED` | Migration `tighten_home_content_rls` applied. Dropped the always-true ALL policies (`auth manage banners` / `auth manage hpv` / `auth manage influencer videos`) and replaced with admin-only `is_admin()` policies. Public storefront reads continue via the existing `public read live X` policies (active + within time window) and the `*_live` SECURITY DEFINER views. Live `pg_policy` confirms only `is_admin()` writes are accepted. |
| C-32 | `SOLVED` | `app/api/checkout/calc-totals/route.ts` no longer reads `body.shippingFee`. The `requestedShippingFee` override path is removed entirely; shipping fee is always the server-computed `computeShippingFee(subtotal, activeMembership)`. Drops one of the two pre-launch revenue-loss exploits (the matching C-33 fix in razorpay/create was already in place from Batch 6). |
| C-39 | `OPEN` (remediation handed off) | Working-tree `.env` scanned and inventoried — contains real production-grade credentials including `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `RAZORPAY_KEY_SECRET` (test prefix), AWS SES, WhatsApp Cloud, Meta App Secret, DTDC Shipsy. `.env` is correctly in `.gitignore`. **No `.git` directory in this working tree** — git-history check + credential rotation must be done by the repo owner. Full checklist: `SECRETS_REMEDIATION.md`. C-39 stays open until rotation + history rewrite (if needed) is complete. |

Local migrations:
- `supabase/migrations/20260427_block_non_admin_role_changes.sql`
- `supabase/migrations/20260427_tighten_home_content_rls.sql`
- `supabase/migrations/20260427_enable_rls_invoice_companies.sql`

C-31 must land **before** C-40 / C-41 / C-42 follow-ups so `is_admin()`
is trustworthy. That ordering was respected — C-31 applied first.

### Implementation Update - 2026-04-25 Database Verification Pass (Batch 7)

Re-ran the previously DB-only checks against the live `madenkorea` Supabase project (`bjudxntmpfpbyloibloc`) on 2026-04-25 via the Supabase MCP connection. All numbers and policy excerpts below are from live queries on this project at that time. Several new findings (`C-40` through `C-43`) surfaced from a `get_advisors` security sweep and have been added.

| ID | New status | Verification notes |
|---|---|---|
| C-21 | `OPEN` re-confirmed | `home_banners` has 6 rows total, 2 active. `link_url IS NULL` for **all 6**, including both active banners. Banner CMS schema supports `link_url`; live data must be backfilled. |
| C-22 | `PARTIAL` (revised) | `home_banners.alt` is `NOT NULL` in schema, and 0 rows have empty `alt` (active or inactive). The original "alt null" finding is no longer accurate. `title` is null/empty for all 6 rows; that is lower-stakes (SEO/admin label), not the accessibility-blocking alt-text bug originally described. Track remaining title backfill as a content task. |
| C-23 | `OPEN` re-confirmed (worse than current register) | Live counts: **122 total products, 14 published, 5 published+in-stock, 9 published+OOS, 108 unpublished**. Slight improvement from the original audit (1 in stock → 5), but the storefront is still effectively empty for retail traffic. Update the legacy header note that says "92 of 106 unpublished" — the live numbers are now 108/122. |
| C-24 | `OPEN` re-confirmed | Live brand coverage: **28 total brands, 4 with published products, 24 with none**. The original 4-of-23 ratio has degraded slightly. `/brands` page already filters to brands-with-published-products (see C-06), so customers will not see the 24 empty ones from `/brands`. Header brand menu and home `BrandCarousel` data sources should be re-verified to apply the same filter. |
| C-25 | `PARTIAL` re-confirmed | Brand row `Made in Korea` still exists in the DB (1 row). It is hidden by `/brands` page filtering (see C-06). Decide whether to delete/rename the DB row, and audit any other surfaces (carousel, header menu, brand search) that still join `brands` without the same filter. |
| C-31 | `OPEN` **critical** re-confirmed | `pg_policy` lists **two** UPDATE policies on `public.profiles`: `own profile update` (`USING (id = auth.uid())`, no `WITH CHECK`) and `profiles_update_own` (`USING (auth.uid() = id)`, `WITH CHECK (auth.uid() = id)`). Neither policy restricts which columns can be updated. **Any authenticated user can run `update profiles set role = 'admin' where id = auth.uid()` and become an admin.** Recommended fix: add a column-level guard via a `BEFORE UPDATE` trigger that rejects role changes by non-admins, or move roles to a protected `user_roles` table with admin-only write policies. The protected-table approach is cleaner long-term. |
| C-34 | `OPEN` re-confirmed (broader scope than original report) | Verified `relrowsecurity=false` on `orders`, `order_items`, `customers`, `user_memberships`, `invoice_companies` (and many more — see C-42). Critically, `orders` and `order_items` already have ownership policies defined (`orders read own`, `orders update own`, `order_items read own`, etc.), but those policies are inert because RLS is off. Enabling RLS will activate them; **test all customer/admin order flows immediately after** because some routes that relied on open access may break. |

#### New findings from the live security advisor sweep

These were not in the original 2026-04-24 audit. They surfaced from `mcp__claude_ai_Supabase__get_advisors(security)` and are added here for tracking.

##### C-40 - `invoice_companies` exposes financial fields without RLS

**Status:** `SOLVED` 2026-04-27 (Batch 8). Migration `enable_rls_invoice_companies` applied live. RLS enabled on `public.invoice_companies` plus an `admin all invoice_companies` policy gated by `public.is_admin()`. Account number and SWIFT code are no longer reachable through PostgREST without admin role. The table is read/written exclusively by `/admin/invoices/*` pages — confirmed via grep before applying. Local file: `supabase/migrations/20260427_enable_rls_invoice_companies.sql`.

**Earlier status:** `OPEN` — added 2026-04-25.

**What is happening:** Table `public.invoice_companies` is reachable through the public PostgREST API, has no RLS enabled, and contains `account_number` and `swift_code` columns.

**Why it matters:** Anyone who can call the anon/public API can read company bank-account and SWIFT details. This is a direct financial-data leak.

**Recommended fix:** Enable RLS on `invoice_companies` and add an admin-only SELECT policy. If the columns are not strictly needed in the API surface, consider moving them to a separate admin-only table or restricting via grants.

**Confidence:** `[VERIFIED-DB]` (live advisor finding).

##### C-41 - Home content tables have always-true RLS policies

**Status:** `SOLVED` 2026-04-27 (Batch 8). Migration `tighten_home_content_rls` applied live. The three always-true ALL policies (`auth manage banners` / `auth manage hpv` / `auth manage influencer videos`) were dropped and replaced with admin-only policies gated by `public.is_admin()`. Public storefront reads continue to work via the existing `public read live X` policies (active-and-within-time-window) and the SECURITY DEFINER `*_live` views. All admin write paths confirmed via grep — they live under `/admin/cms/banners`, `/admin/cms/product-video`, `/admin/cms/influencer-video`. Local file: `supabase/migrations/20260427_tighten_home_content_rls.sql`.

**Earlier status:** `OPEN` — added 2026-04-25.

**What is happening:** Three home-content tables have an `ALL` policy whose `USING` and `WITH CHECK` are both literal `true`:

- `public.home_banners` (policy `auth manage banners`)
- `public.home_product_videos` (policy `auth manage hpv`)
- `public.home_influencer_videos` (policy `auth manage influencer videos`)

**Why it matters:** Any authenticated user — including a freshly registered customer — can `INSERT`, `UPDATE`, or `DELETE` rows in these tables. Combined with C-31 this means a customer can wipe or rewrite the home page banners, product video carousel, and influencer videos.

**Recommended fix:** Replace the always-true policy with admin-only write policies (`is_admin()` or membership in `app_admins`). Keep public/anonymous SELECT only on the `*_live` views/columns actually meant to be public.

**Confidence:** `[VERIFIED-DB]`.

##### C-42 - Many public tables are exposed without RLS

**Status:** `OPEN` — added 2026-04-25.

**What is happening:** The advisor flagged 35 tables in `public` with RLS disabled, including:

- Customer/account: `customers`, `user_memberships`, `store_credits`, `password_reset_tokens`, `contact_messages`.
- Admin/back-office: `app_admins`, `inventory_units`, `inventory_events`, `invoice_*`, `batches`.
- Marketing: `email_unsubscribe`, `facebook_*`, `instagram_comments`, `instagram_media_posts`, `social_scheduled_posts`, `whatsapp_*`.
- CMS/catalog: `categories`, `brands`, `product_images`, `membership_plans`.

Nine of these tables (`brands`, `categories`, `order_items`, `orders`, `product_images`, `whatsapp_campaigns`, `whatsapp_campaign_messages`, `whatsapp_contacts`, `whatsapp_templates`) already have policies defined but RLS is off, so the policies are inert.

**Why it matters:** Direct PostgREST/anon-key reads against these tables can return rows the application would otherwise gate. `password_reset_tokens` and `app_admins` are particularly sensitive.

**Recommended fix:** Run an RLS-enablement campaign per table:

1. Enable RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
2. Add policies appropriate to the table (public read for catalog content, owner-only for user-owned data, admin-only for back-office).
3. Re-test app routes that touched the table.

C-34 (orders/order_items/customers/user_memberships) is the highest-priority subset; the rest can be staged but should not be left indefinitely.

**Confidence:** `[VERIFIED-DB]`.

##### C-43 - Several views are `SECURITY DEFINER` and may bypass RLS

**Status:** `OPEN` — added 2026-04-25.

**What is happening:** Eight views in `public` are defined with `SECURITY DEFINER`, meaning they execute with the owner's privileges and can bypass RLS on the underlying tables when queried by less-privileged roles:

- `home_banners_live`, `home_product_videos_live`, `home_influencer_videos_live`
- `brands_live`
- `products_with_pricing`
- `vendor_product_expiry_status`
- `product_wishlist_counts`
- `product_review_stats`

**Why it matters:** Once RLS is enabled on the underlying tables (C-34/C-42), `SECURITY DEFINER` views can still leak rows the policies would block. Conversely, dropping the property may break flows that currently depend on it.

**Recommended fix:** Audit each view, redefine without `SECURITY DEFINER` where possible, and add explicit RLS policies on the base tables. For the `_live` views (`home_banners_live`, `brands_live`, `home_product_videos_live`, `home_influencer_videos_live`), confirm they are intended as public-read curated views and are scoped to active/published rows only.

**Confidence:** `[VERIFIED-DB]`.

##### Lower-severity findings (track but not launch-blocking)

- **`pg_trgm` extension installed in `public`.** Move to a dedicated schema (e.g. `extensions`).
- **Auth: leaked-password protection disabled.** Enable HaveIBeenPwned check in Supabase Auth settings.
- **Public storage buckets allow listing.** `facebook-media`, `product-media`, `review-media`, `site-assets` each have a broad SELECT policy on `storage.objects`. Public buckets do not need this for object-URL access; tighten to the standard "public read by name" pattern instead of allowing `LIST`.
- **61 functions have mutable `search_path`.** Routine cleanup: add `SET search_path = public, pg_temp` to function definitions to avoid `search_path`-based privilege escalation.

### Implementation Update - 2026-04-25 Verification Pass (Batch 6)

A code-side re-verification of items previously listed as "still open" found the following changes already present in the working tree. DB-only items (`C-21`, `C-22`, `C-23`, `C-24`, `C-31`, `C-34`, `C-39`) cannot be re-confirmed from code alone and remain flagged for live database/repo-history checks.

| ID | New status | Verification notes |
|---|---|---|
| C-06 | `SOLVED_AFTER_VALIDATION` | `app/brands/page.tsx` reads live `products` + `brands` from Supabase, filters to brands with at least one published product, sorts alphabetically, and explicitly excludes any brand row whose name is `Made in Korea`. No `lib/mock-data/brands.json` import remains on this page. |
| C-09 | `SOLVED_AFTER_VALIDATION` | `app/account/orders/[orderId]/invoice/page.tsx` no longer queries the `invoices` table at all. The bad `invoices.order_id` lookup is gone; the page now builds the invoice from order/order-items data and ownership-checks via `.eq('user_id', user.id)`. The deeper compliance gap (real invoice records, GST fields, sequenced invoice numbers) is tracked under the GST/tax invoicing production-readiness section, not C-09. |
| C-10 | `PARTIAL` | Both `app/account/orders/[orderId]/page.tsx` and `app/account/orders/[orderId]/invoice/page.tsx` now scope the order lookup with `.eq('user_id', user.id)`, so customer-facing IDOR is closed. The original report also flagged RLS being disabled on `orders`/`order_items`; that remains a DB-side gap tracked under C-34. |
| C-13 | `SOLVED_PENDING_DEPLOY` (2026-04-30) | Manual admin progression already worked. Automatic progression now flows from the DTDC poller: `lib/dtdc/poller.ts` maps tracking actions to a shipment status, and on transition calls the new `dtdc_apply_status_to_order(p_order_id, p_new_status)` SECURITY DEFINER function (migration `20260427_dtdc_poller_and_serviceability_scaffold.sql`) which forwards `paid → shipped → out_for_delivery → delivered` while refusing to move backward from terminal states. The poller runs every 30 min via the new `/api/cron/dtdc-poll` route; closure is gated on the user scheduling pg_cron and providing real DTDC tracking creds. |
| C-25 | `PARTIAL` | `/brands` page filters out the `Made in Korea` brand from public display (see C-06). Whether the row should also be deleted/renamed in the database, and whether other brand surfaces (header menu, home BrandCarousel) also exclude it, must be confirmed live. |
| C-26 | `SOLVED_AFTER_VALIDATION` | `app/api/reviews/create/route.ts` requires a qualifying paid/shipped/delivered order containing the product before insert, then sets `is_verified_purchase: true` on every legitimate review. The badge surface in `app/products/[slug]/product.tsx` reads this field. Note: this means every review now gets the verified flag; if the product surface should also support unverified guest-style reviews, that is a separate scope decision. |
| C-32 | `OPEN` (re-confirmed) | `app/api/checkout/calc-totals/route.ts` still reads `body.shippingFee` and uses `requestedShippingFee` in place of the server-computed `computeShippingFee(...)` value when present (lines 35-38, 225-227). The exploit path described in the original report still applies. Fix needed before launch. |
| C-33 | `SOLVED_AFTER_VALIDATION` | `app/api/razorpay/create/route.ts` looks up the order by id from Supabase using the service-role client, verifies `order.user_id === userId` from the authenticated session, and uses `order.total` from the database (falling back to subtotal + server shipping − discount). It no longer trusts client-supplied totals. **Important caveat:** the upstream `calc-totals` flow that writes `order.total` is still vulnerable per C-32, so an attacker could still influence the persisted total via shipping manipulation until C-32 is fixed. |
| M-05 | `PARTIAL` | Price/duration source of truth was moved to `lib/membership.ts` (`MEMBERSHIP_PRICE = 199`, `MEMBERSHIP_DURATION_DAYS = 90`), and `app/api/membership/create-order/route.ts` derives Razorpay paise via `Math.round(MEMBERSHIP_PRICE * 100)` from the constant. A stray `amount: 199` literal still appears in `app/api/membership/verify/route.ts` line 108; switch it to the constant. The recommended `membership_plans` DB-table source of truth is still future work. |
| M-06 | `SOLVED_AFTER_VALIDATION` | `app/account/orders/[orderId]/page.tsx` shows the Reorder button whenever `items.some((i) => !!i.product_id)` (line 433). It is no longer gated on `status === 'delivered'`, so the C-13 ordering issue no longer hides reorder. |
| M-07 | `SOLVED` (2026-04-30) | `app/api/razorpay/verify/route.ts` now inserts a `payments` row on every successful capture (provider, provider_payment_id, provider_order_id, method, status=`captured`, amount, currency, signature, raw payload). Best-effort wrapped in try/catch so a payments-row failure cannot block the verify path. Backfills the rows the customer-facing order detail used to fall back to and unblocks reporting/refund tooling. |
| M-09 | `SOLVED_AFTER_VALIDATION` | `lib/hooks/useRazorpayCheckout.ts` now routes the three failure paths separately: `modal.ondismiss` → `/order/failure?reason=cancelled`, `payment.failed` event → `/order/failure?reason=failed`, server-side verification failure → `/order/failure?reason=verification`. The original "only signature failure" gap is closed; the failure page itself can still be improved to handle each `reason` distinctly with retry/cleanup affordances. |
| C-04 | `SOLVED_PENDING_DEPLOY` (2026-04-30) | Real serviceability is now wired through Shipsy. `lib/dtdc/serviceability.ts` calls the carrier's pincode endpoint, normalizes both `serviceable: Y/N` and `is_serviceable: bool` shapes plus single-day or range ETAs. `app/api/dtdc/serviceability/route.ts` caches results for 7 days in `pincode_serviceability_cache` and fails open (`serviceable: null`) on courier outages so transient failures don't block the storefront. The product page (`app/products/[slug]/product.tsx`) and `app/checkout/checkout.tsx` both consult it; checkout blocks payment if the carrier definitively says the pincode is not deliverable. Closure depends on real Shipsy creds in env; the path falls open today with the placeholder. |
| N-22 | `SOLVED` | `public/square-logo.png` exists and `app/about/page.tsx` references it as `/square-logo.png` in OG metadata. No `squar-logo` typo remains anywhere outside this register. |

### Status Legend

- `SOLVED` - validation found the issue fixed in the current codebase.
- `NOT_SOLVED` - issue was claimed fixed, but validation found the bug still present.
- `PARTIAL` - some remediation exists, but remaining work is documented.
- `SOLVED_AFTER_VALIDATION` - fixed in this repo after the 2026-04-24 validation report.
- `OPEN` - still open from the original report and not included in solved handoff.
- `WITHDRAWN` - removed from remediation because the finding was invalid or unverified.

### Confirmed Solved

These issues were validated as fixed in the uploaded codebase.

| ID | Status | Validation notes |
|---|---|---|
| C-02 | `SOLVED` | `components/ProductCard.tsx` uses `stock_qty`; product detail gates Add to Cart and Buy Now on `isOutOfStock`; `/api/checkout/calc-totals` returns `OUT_OF_STOCK_ITEM` for `stock_qty <= 0`. |
| C-03 | `SOLVED` | Wishlist now writes to Supabase `wishlist_items`; heart UI exists on product cards and detail page. |
| C-30 | `SOLVED` | Add-to-wishlist UI exists on product cards and product detail. |
| N-06 | `SOLVED` | Wishlist page uses correct `addItem(productId, 1)` signature. |
| C-05 | `SOLVED` | Contact form posts to `/api/contact`; route inserts into `contact_messages`; migration `20260422_create_contact_messages.sql` exists. |
| C-07 | `SOLVED` | Review uploads and public URL reads both use `review-media`; legacy prefixed paths handled. |
| C-15 | `SOLVED` | `/terms` and `/privacy` exist and register page links to them. |
| C-17 | `SOLVED` | Contact phone is env-driven via `NEXT_PUBLIC_SUPPORT_PHONE`; phone card hides when unset. |
| C-18 | `SOLVED` | Contact address is env-driven via `NEXT_PUBLIC_SUPPORT_ADDRESS`; graceful fallback exists. |
| C-27 | `SOLVED` | Review API requires qualifying paid/order ownership before allowing review creation; UI maps `PURCHASE_REQUIRED`. |
| C-29 | `SOLVED` | Search autocomplete has loading, error, and no-results states. |
| C-36 | `SOLVED` | Membership create/verify routes resolve authenticated user ID server-side instead of trusting request body. |
| C-37 | `SOLVED` | Password change re-authenticates with current password before calling `updateUser`. |
| C-38 | `SOLVED` | Promo validation functions enforce `max_uses` via `coalesce(p.uses, 0) < p.max_uses`. |
| M-01 | `SOLVED` | Checkout loads saved addresses and persists order-time address to `addresses`. |
| M-02 | `SOLVED` | Checkout redirect includes `/auth/login?redirect=/checkout`. |
| M-03 | `SOLVED` | `/order/success` pulls real order data and displays order number/total. |
| M-04 | `SOLVED` | K-Plus page confirms before repurchase when membership already active. |
| M-15 | `SOLVED` | `/shop-199` filters sale windows with start/end date null handling. |
| M-18 | `SOLVED` | Invoice footer domain corrected to `www.madenkorea.com`. |
| M-19 | `SOLVED` | Footer Threads link uses `FaThreads`. |
| M-20 | `SOLVED` | Login uses `mapAuthError()` for friendly auth messages. |
| M-21 | `SOLVED` | Forgot-password page stays in place and shows success banner/toast. |
| M-22 | `SOLVED` | Category and brand pages include sort and filters. |
| M-23 | `SOLVED` | Wishlist distinguishes no filter matches from truly empty. |
| M-25 | `SOLVED` | Cart quantity updates have in-flight state; remove confirms and shows toast. |
| M-31 | `SOLVED` | Saved addresses empty state includes Add Address CTA. |
| M-32 | `SOLVED` | Settings address actions have loading states and in-flight labels. |
| N-02 | `SOLVED` | Empty `/search` redirects to `/`, resolving dead-page state. |
| N-04 | `SOLVED` | Global not-found page now offers navigation actions. |
| N-05 | `SOLVED` | `/order/success` no longer generates fake `Date.now()` order numbers. |
| N-08 | `SOLVED` | Public assets no longer have spaces in filenames. |
| N-09 | `SOLVED` | Disabled header items show "Coming soon" caption. |
| N-12 | `SOLVED` | Best Seller page backfills to target 8 items from published/featured products. |
| N-13 | `SOLVED` | Privacy policy uses consistent `info@madenkorea.com`. |
| N-14 | `SOLVED` | Privacy policy date updated to April 20, 2026. |
| N-17 | `SOLVED` | Review list has initial loading skeleton. |
| N-18 | `SOLVED` | Review summary shows average, count, stars, and distribution. |
| N-19 | `SOLVED` | Floating WhatsApp number is env-driven through site config. |

### Claimed Solved But Subsequently Fixed

These were found broken in the validation report, then fixed or verified in later quick-fix batches.

#### C-01 - Cart product thumbnails link to nonexistent `/p/{slug}`

**Status:** `SOLVED_AFTER_VALIDATION`

**Validated code state:** The validation report found `app/cart/page.tsx` still linked to `/p/${p.slug}` and no `app/p/` route existed.

**Implemented fix:** Both cart product links now use `/products/${p.slug}` with `"#"` fallback when no slug is present.

**Priority:** Closed unless a later regression reintroduces `/p/` links.

#### M-17 - Two product route directories coexist

**Status:** `SOLVED_AFTER_VALIDATION`

**Validated code state:** The validation report found both route implementations still existed:

- `app/product/[slug]/page.tsx`
- `app/product/[slug]/product.tsx`
- `app/products/[slug]/page.tsx`
- `app/products/[slug]/product.tsx`

**Implemented fix:** The dead legacy implementation file `app/product/[slug]/product.tsx` was removed. `app/product/[slug]/page.tsx` remains as a small redirect shim to `/products/[slug]`, preserving query params for external/backward-compatible links.

**Priority:** Closed unless a later route reintroduces a second product detail implementation.

#### N-03 - Search autocomplete and `/search` page use different query logic

**Status:** `SOLVED_AFTER_VALIDATION`

**Validated code state:** `/search` still uses `ILIKE` against `name` and `short_description`, while autocomplete calls `search_products_tsv`.

**Implemented fix:** `/search` now calls `search_products_tsv` with the same config as autocomplete, then fetches full product-card records for the matched IDs and preserves the RPC result order.

**Priority:** Closed unless search result parity regresses.

### Partial Fixes

These issues have some remediation but still need a final pass.

#### N-01 - Contact page has no in-nav entry point

**Status:** `SOLVED_AFTER_VALIDATION`

**Solved portion:** Footer Contact Us link restored in `components/Footer.tsx`.

**Implemented fix:** Header desktop nav and mobile menu now include Support links to `/contact`.

#### C-12 - Placeholder image fallback

**Status:** `SOLVED_AFTER_VALIDATION`

**Solved portion:** `public/placeholder.png` exists.

**Remaining bug from validation:** `/placeholder.svg` was referenced in `app/brands/page.tsx` and `app/_data/getBrands.ts`, but `public/placeholder.svg` did not exist.

**Implemented fix:** Both brand fallback references now use `/placeholder.png`.

#### M-08 - Misspelled support emails

**Status:** `SOLVED_AFTER_VALIDATION`

**Solved portion:** Most wrong support email variants were corrected.

**Remaining bug from validation:** `app/vendor/(protected)/page.tsx` referenced `support@madeinkorea.in`.

**Implemented fix:** Vendor dashboard now uses `support@madenkorea.com`.

#### M-16 - Store name variants

**Status:** `SOLVED_AFTER_VALIDATION`

**Solved portion:** Reduced from five variants to three.

**Implemented fix:** Customer-facing store-brand copy was normalized to `MadenKorea` in footer image alt text, Razorpay confirmation email subject/body/plain text, and influencer request hero copy.

**Remaining note:** Some `Made in Korea` literals remain intentionally as product-origin/admin field labels or dead mock-data metadata, not as store-brand naming.

#### M-30 - Destructive actions lack confirmation

**Status:** `SOLVED_AFTER_VALIDATION`

**Solved portion:** Delete address, cart remove, wishlist remove, and wishlist bulk remove now confirm.

**Remaining bug from validation:** `deleteReview(id)` in `app/products/[slug]/product.tsx` lacked confirmation.

**Implemented fix:** `deleteReview(id)` now returns early unless the user confirms deletion.

### Still Open From Original Report

Updated 2026-04-25 after the Batch 6 verification pass. Items moved to `SOLVED_AFTER_VALIDATION` or `PARTIAL` are listed in the Batch 6 table above; only items where the original report's bug still applies remain in this list.

Critical still open (live-verified 2026-04-25 unless noted; updated after Batch 8):

- C-21 - Home page hero banners have no destination URLs. Live DB: 6 banners, 2 active, all 6 with `link_url IS NULL`. Backfill required.
- C-23 - Live catalog is effectively empty. Live DB: 122 products, 14 published, 5 in stock, 108 unpublished.
- C-24 - Most brands lead to empty pages. Live DB: 28 brands, 4 with published products, 24 empty. Mitigated on `/brands` only.
- C-34 - RLS disabled on `orders`, `order_items`, `customers`, `user_memberships`. Inert ownership policies already defined on `orders`/`order_items`. Deferred from Batch 8 — needs an audit of every read path before flipping the switch.
- C-39 - Potentially leaked API keys. **Remediation checklist created (`SECRETS_REMEDIATION.md`)** and handed to the repo owner for git-history scan + credential rotation. Status remains OPEN until that checklist is completed.
- C-42 - 35 public tables without RLS, including `app_admins`, `password_reset_tokens`, `customers`, `user_memberships`, `whatsapp_*`. (Batch 7 finding.)
- C-43 - 8 `SECURITY DEFINER` views may bypass RLS once underlying tables are protected. (Batch 7 finding.)

Critical now SOLVED in Batch 8:

- C-31, C-32, C-40, C-41 — see Batch 8 table for details.

Critical now downgraded to PARTIAL:

- C-10 - Customer order/invoice queries now ownership-scope; RLS gap remains under C-34. (Batch 6.)
- C-22 - `home_banners.alt` is NOT NULL in schema and live data has no null/empty alt; only `title` remains null on all 6 rows (low-stakes content task). (Batch 7.)
- C-25 - `/brands` filters out the conflicting brand row (still present in DB), but other surfaces still need a check. (Batches 6 + 7.)

Critical SOLVED_PENDING_DEPLOY in Batch 9 (DTDC sprint, 2026-04-30) — code-complete, awaiting cron schedule + real DTDC creds:

- C-04 - Real Shipsy serviceability with cache + fail-open behaviour now drives the product page and gates checkout.
- C-13 - DTDC poller maps tracking actions to shipment status and forwards changes to `orders.status` via `dtdc_apply_status_to_order`.
- C-14 - `/api/cron/dtdc-poll` polls active shipments in 25-row batches every 30 min once the user runs the pg_cron schedule SQL.

Critical now SOLVED_AFTER_VALIDATION (see Batch 6):

- C-06, C-09, C-26, C-33.

Critical re-confirmed OPEN:

- C-32 - Shipping fee can still be manipulated by client via `body.shippingFee` in `/api/checkout/calc-totals`.

Moderate still open:

- (None remain fully open from the original "still open" list after Batch 6.)

Moderate now PARTIAL (see Batch 6):

- M-05 - Price/duration are now in shared constants; not yet in a `membership_plans` DB table; one stray `amount: 199` literal remains in the verify route.

Moderate SOLVED in Batch 9 (DTDC sprint, 2026-04-30):

- M-07 - `app/api/razorpay/verify/route.ts` writes a `payments` row on every successful capture (provider, ids, method, status, amount, currency, signature, raw payload). Best-effort wrapped, can't break verify.

Moderate now SOLVED_AFTER_VALIDATION (see Batch 6):

- M-06, M-09.

Minor still open:

- N-10 - 92 of 106 products are unpublished; DB count should be re-verified.
- N-21 - Home radial gradient may render poorly on some mobile browsers.

Minor now SOLVED (see Batch 6):

- N-22.

### Withdrawn

| ID | Status | Notes |
|---|---|---|
| C-35 | `WITHDRAWN` | `?debug=1` Razorpay verify leak was unverified and later found incorrect as stated. |

### Quick Verification Commands

PowerShell equivalents may be needed on Windows; these are the original quick checks from the validated update.

```bash
# C-01 cart routes; should return no results after fix
grep -n '/p/' app/cart/page.tsx

# M-17 product directories; should show only canonical route after fix
ls app/ | grep -E '^product'

# N-03 search code paths; should converge after fix
grep -n 'ilike\|search_products_tsv' app/search/page.tsx components/SearchAutocomplete.tsx

# C-12 placeholder.svg references; should return no results after fix
grep -rn 'placeholder\.svg' app/ components/

# M-08 wrong-domain email; should return no results after fix
grep -rn 'madeinkorea\.in' app/ components/

# M-16 store name variants; ideally only canonical name remains
grep -rhoE 'Made[ -]?(i|I)n[ -]?Korea|MadenKorea' app/ components/ | sort -u

# M-30 deleteReview confirm; should show a confirmation guard after fix
grep -A2 'async function deleteReview' app/products/\[slug\]/product.tsx
```

## Critical Issues

Critical issues are launch blockers, security/compliance blockers, revenue-loss issues, data leaks, or major customer-trust failures.

### C-01 - Cart product thumbnails link to a route that does not exist

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Cart links now use `/products/${p.slug}` with a fallback for missing slugs.

**What is happening:** On `/cart`, product thumbnails and names link to `/p/{slug}`. The app has product routes at `/products/{slug}` and a legacy/degraded `/product/{slug}` route, but no `/p/` route.

**Why it matters:** Cart is a high-intent purchase page. A 404 here makes the checkout flow feel broken right before payment.

**How it is encountered:** A customer opens the cart, clicks a product image or title to re-check the product, and lands on the global 404.

**Likely root cause:** Older route convention or copied template code remained in `app/cart/page.tsx`.

**Blast radius:** Every cart user who clicks a thumbnail or product title.

**Confirmation:** Add a product, open `/cart`, click the product image/name, and confirm the 404.

**Recommended fix:** Replace both cart `href` values with `/products/${slug}`.

**Follow-on work:** Verify `slug` is consistently available for guest cart, authenticated cart, and hydrated cart rows.

**Confidence:** `[VERIFIED-CODE]`

### C-02 - Out-of-stock products can be purchased

**What is happening:** Customer flows do not check `stock_qty` before Add to Cart, Buy Now, or checkout. `ProductCard` checks `product.inventory?.qty`, but Supabase queries use the flat `stock_qty` column, so the out-of-stock badge never reliably appears.

**Why it matters:** The earlier audit found 14 published products, 13 with `stock_qty = 0`, and only 1 in stock. Customers can pay for items that cannot be shipped, creating refunds, chargebacks, support tickets, and bad reviews.

**How it is encountered:** A visitor browses featured or trending products, adds an out-of-stock item, and proceeds to payment.

**Likely root cause:** `ProductCard` was built for an older nested inventory shape and was not updated when the data layer moved to Supabase.

**Blast radius:** Product listings, product detail pages, cart, and checkout. The issue affects most visible products in the earlier catalog state.

**Confirmation:** Add a featured/trending product with `stock_qty = 0` and proceed to checkout.

**Recommended fix:** Use `stock_qty` in all product queries, display OOS state in cards and detail pages, disable purchase actions when `stock_qty <= 0`, and enforce stock checks in server-side order creation and `/api/checkout/calc-totals`.

**Follow-on work:** Add `is_in_stock` or a stock helper, add stock notification signup, and consider a `backorder_allowed` field if preorders are intended.

**Confidence:** `[VERIFIED-CODE]`, `[VERIFIED-DB]`

### C-03 - Wishlist is unusable end-to-end

**What is happening:** No customer-facing UI calls `toggleWishlist()`. The product detail heart button is commented out, `ProductCard` has no heart, `WishlistContext` writes to localStorage, and `/account/wishlist` reads from Supabase `wishlist_items`.

**Why it matters:** The account dashboard advertises wishlist functionality, but customers cannot save products and the wishlist page reads from a different data source. This creates a false promise and loses valuable remarketing intent data.

**How it is encountered:** A logged-in user opens Account, clicks Wishlist, sees it empty, then cannot find any way to add products.

**Likely root cause:** Wishlist was partially built: DB table and read page exist, but the write path stayed as a localStorage stub and the UI was later hidden.

**Blast radius:** Every logged-in customer who expects saved products.

**Confirmation:** Check `app/products/[slug]/product.tsx` for the commented heart button and compare `WishlistContext` storage behavior with `/account/wishlist/page.tsx`.

**Recommended fix:** Decide whether to keep or retire wishlist. If keeping, write Supabase RPCs or table operations for add/remove, handle unauthenticated staging or login prompt, restore heart UI on product detail and cards, and fix wishlist-to-cart calls. If retiring, remove the account card, page, provider, and DB table.

**Follow-on work:** Add move-to-cart, share wishlist, and marketing event tracking after consent.

**Confidence:** `[VERIFIED-CODE]`, `[VERIFIED-DB]`

### C-04 - Check Delivery pincode is fake

**Current validation status:** `SOLVED_PENDING_DEPLOY` as of 2026-04-30. The recommended fix is now implemented end-to-end:

- `lib/dtdc/serviceability.ts` calls Shipsy's customer-pincode endpoint (configurable via env), normalises both `serviceable: Y/N` and `is_serviceable: bool` shapes plus single-day or `min_days–max_days` ETA ranges.
- `app/api/dtdc/serviceability/route.ts` checks a 7-day TTL cache (`pincode_serviceability_cache`) before hitting the carrier and writes successful live responses back into the cache. On any carrier error it returns `serviceable: null, source: 'live-undetermined'` so transient failures fall open.
- `app/products/[slug]/product.tsx` consumes the route and shows real messages: "✓ Deliverable to {pincode} in 3–5 days." or "Sorry, we don't deliver to {pincode} yet…".
- `app/checkout/checkout.tsx` re-checks the pincode before payment and blocks (toast error) when serviceable === false. Network errors fail open so transient outages don't break checkout.

Closure depends on the user populating real Shipsy creds in env; with placeholder creds the path falls open today.

**What is happening:** Product detail pincode check waits briefly and always returns delivery availability with an estimate five days from now. It does not call DTDC serviceability or any pincode table.

**Why it matters:** It can promise delivery to invalid or unserviceable pincodes, creating failed deliveries and potential consumer-protection problems.

**How it is encountered:** A customer enters any six digits, including `000000`, and receives a positive delivery result.

**Likely root cause:** Placeholder UI behavior was never connected to DTDC or a serviceability dataset.

**Blast radius:** Every product detail visitor who uses pincode checking.

**Confirmation:** Enter `000000` on a product page and observe the positive response.

**Recommended fix:** Use DTDC pincode serviceability, or maintain/cache a `serviceable_pincodes` table. Compute honest ETA ranges from zone and dispatch cutoffs.

**Follow-on work:** Reuse the same validation at checkout before payment.

**Confidence:** `[VERIFIED-CODE]`

### C-05 - Contact form silently discards every customer message

**What is happening:** `/contact` submit waits on a timeout and shows success. There is no API call, DB insert, or email send.

**Why it matters:** Customers believe support received their message, then never get a response. This is especially damaging in early storefront operations and may fail customer-care obligations.

**How it is encountered:** A customer submits the contact form, sees a success toast, and closes the page.

**Likely root cause:** Template/scaffold code was never replaced with a real integration.

**Blast radius:** Every contact form user.

**Confirmation:** Submit the form and verify no inbox message, Supabase row, or SES event is created.

**Recommended fix:** Add a `contact_messages` table and a `/api/contact/submit` route that stores the message and notifies `info@madenkorea.com` through SES with reply-to set to the customer email.

**Follow-on work:** Add `/admin/contact`, auto-reply email, and anti-spam protection.

**Confidence:** `[VERIFIED-CODE]`

### C-06 - `/brands` renders fabricated mock brands

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `app/brands/page.tsx` reads live `products` + `brands` from Supabase, builds a count map of published products per brand, fetches brands by id, sorts alphabetically, and explicitly filters out any brand whose name (lowercased, trimmed) is `made in korea`. No mock-data import remains on this page.

**What is happening:** `/brands` imports `lib/mock-data/brands.json` and displays hard-coded K-beauty brands that do not match the live catalog. Clicking them routes to `/brand/{slug}` and 404s.

**Why it matters:** The real brands are not discoverable from `/brands`, while fake/mock brand tiles lead customers to errors.

**How it is encountered:** A customer opens `/brands`, clicks a mock brand such as Cosrx, and lands on 404.

**Likely root cause:** Mock data was never replaced with Supabase brand data.

**Blast radius:** Every customer using the brand landing page; also SEO and campaign traffic to `/brands`.

**Confirmation:** Open `/brands`, click one of the mock tiles, and compare slugs with live `brands` rows.

**Recommended fix:** Server-render real Supabase brands with at least one published product. Query `brands` joined to `products`, group by brand, filter to product count greater than zero, and order by product count/name.

**Follow-on work:** Remove unused mock brand data after verification, add logos/hero art, and add brand search/filter.

**Confidence:** `[VERIFIED-CODE]`, `[VERIFIED-DB]`

### C-07 - Review photos upload to the wrong public URL bucket

**What is happening:** Review uploads go to Supabase bucket `review-media`, but `storagePublicUrl(path)` in `app/products/[slug]/product.tsx` builds URLs from `product-media`.

**Why it matters:** Uploaded review photos exist in storage but render as broken images. Photo reviews are a major trust signal; broken review media harms credibility.

**How it is encountered:** A customer submits a review with photos. The resulting image URLs point at the wrong bucket and 404.

**Likely root cause:** Product-image helper was reused for review media without a bucket parameter.

**Blast radius:** Every review with photos.

**Confirmation:** Compare the review upload bucket with the public URL helper bucket.

**Recommended fix:** Parameterize the bucket in `storagePublicUrl(path, bucket = "product-media")` and pass `review-media` for review images.

**Follow-on work:** Audit other storage buckets such as site assets and social media buckets.

**Confidence:** `[VERIFIED-CODE]`

### C-08 - Referral links land on the degraded product page

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `app/r/[code]/route.ts` builds product referral destinations as `/products/${slug}`, so referral traffic lands on the full product route.

**What is happening:** `app/r/[code]/route.ts` generates product redirects with `/product/${slug}` instead of `/products/${slug}`.

**Why it matters:** Referral and influencer traffic gets a worse landing page than organic traffic: fewer features, no reviews, no full share dialog, and weaker product trust signals.

**How it is encountered:** A customer clicks an influencer or referral link and lands on the legacy `/product` page.

**Likely root cause:** Two product route directories coexist and referral code picked the older path.

**Blast radius:** All referral traffic.

**Confirmation:** Inspect `productUrlFromSlug` in `app/r/[code]/route.ts`.

**Recommended fix:** Return `/products/${slug}` and add a permanent redirect from `/product/:slug*` to `/products/:slug*`.

**Follow-on work:** Audit marketing emails and outbound campaign URLs for `/product/`.

**Confidence:** `[VERIFIED-CODE]`

### C-09 - Invoice page queries a column that does not exist

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `app/account/orders/[orderId]/invoice/page.tsx` no longer queries the `invoices` table at all, so the bad `invoices.order_id` lookup and its PostgREST error are gone. The page now builds the invoice presentation entirely from order/order-items data, with `.eq('user_id', user.id)` ownership scoping. The deeper compliance gap (real customer-invoice records, GST/HSN, sequenced invoice numbers) is tracked under the "GST and tax invoicing gaps" production-readiness section, not C-09.

**What is happening:** `/account/orders/[orderId]/invoice/page.tsx` queries `invoices.order_id`, but the earlier DB audit found no `order_id` column on `invoices`. The page falls back to order data while logging a PostgREST error.

**Why it matters:** Customer invoices are not backed by a real customer-invoice record and may miss GST/tax fields.

**How it is encountered:** A customer opens an invoice from My Orders; the page renders fallback data and logs a DB error.

**Likely root cause:** B2B invoice schema and B2C order-invoice expectations diverged.

**Blast radius:** Every invoice viewer and every paid order needing compliant invoice output.

**Confirmation:** Query `information_schema.columns` for `public.invoices` and check for `order_id`.

**Recommended fix:** Either create a `customer_invoices` table keyed by `order_id`, or add optional `order_id` to `invoices`. Generate the invoice atomically after Razorpay verification.

**Follow-on work:** Add GSTIN, HSN, tax breakdown, PDF/email invoice flow.

**Confidence:** `[VERIFIED-DB]`

### C-10 - Order detail and invoice pages do not check ownership

**Current validation status:** `PARTIAL` as of 2026-04-25. Both `app/account/orders/[orderId]/page.tsx` (line ~88) and `app/account/orders/[orderId]/invoice/page.tsx` now scope the order lookup with `.eq('user_id', user.id)`, so the customer-facing IDOR through these pages is closed. The original report also flagged RLS being disabled on `orders`/`order_items`; that remains a DB-side gap and is tracked under C-34. Defense-in-depth only fully exists once both layers are in place.

**What is happening:** Customer order detail and invoice pages query orders by `id` only, without `.eq('user_id', user.id)`. Earlier audit also found RLS disabled on `orders`.

**Why it matters:** This is an IDOR/PII leak. Any authenticated user with another order UUID could view names, phone numbers, emails, addresses, item details, totals, and statuses.

**How it is encountered:** User B directly visits `/account/orders/<UserAOrderUUID>` while logged in.

**Likely root cause:** Code assumed RLS would enforce ownership, but RLS was disabled and the query did not defend in depth.

**Blast radius:** Every order row, especially any UUID that leaks through logs, screenshots, emails, or support channels.

**Confirmation:** Log in as two users, place an order as User A, and attempt to view it as User B by URL.

**Recommended fix:** Enable RLS on `orders` and `order_items` with owner/admin policies, and add explicit `.eq('user_id', user.id)` filters in customer-facing queries.

**Follow-on work:** Audit all user-owned tables, add access logging, and consider breach assessment if exposure occurred.

**Confidence:** `[VERIFIED-CODE]`, `[VERIFIED-DB]`

### C-11 - Confirmation email View Orders link is broken

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. The Razorpay verify route builds `accountOrdersUrl` from `resolveSiteUrl(req)`, which uses `NEXT_PUBLIC_SITE_URL`, `APP_URL`, or the request origin, then inserts that absolute URL into the email template.

**What is happening:** SES order confirmation email uses a relative link such as `/account/orders`.

**Why it matters:** Email clients do not know the app origin, so relative links fail or resolve incorrectly.

**How it is encountered:** Customer receives order confirmation, clicks View Orders, and nothing useful happens.

**Likely root cause:** Email template was tested inside app/browser context where relative URLs work.

**Blast radius:** Every buyer receiving confirmation email.

**Confirmation:** Inspect received email HTML and click from Gmail/Outlook.

**Recommended fix:** Build absolute URLs with `NEXT_PUBLIC_SITE_URL` or a safe production fallback.

**Follow-on work:** Add a shared `urlFor(path)` helper for all email templates and audit welcome/reset/order emails.

**Confidence:** `[VERIFIED-CODE]`

### C-12 - `/placeholder.png` fallback needs re-verification

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Brand fallbacks now point to existing `/placeholder.png`.

**What is happening:** Earlier audit reported order detail and invoice pages fallback to `/placeholder.png` when product images are missing, and that the asset did not exist. Later dead-code scanning found `public/placeholder.png`, so the current state must be re-checked before action.

**Why it matters:** If missing or invalid, invoices and order detail pages show broken images.

**How it is encountered:** A historical order references a deleted or missing product hero image.

**Likely root cause:** Conventional placeholder path was assumed.

**Blast radius:** Orders with missing product images.

**Confirmation:** Verify `public/placeholder.png` exists and renders, then grep for `/placeholder.svg`, `/placeholder.png`, and similar fallbacks.

**Recommended fix:** Keep a real placeholder asset or replace image fallbacks with an inline unavailable-image UI.

**Follow-on work:** Standardize image fallback behavior across orders, invoices, product cards, and brand pages.

**Confidence:** `[VERIFIED-CODE]`, with current-state re-check required.

### C-13 - Orders never progress past paid

**Current validation status:** `SOLVED_PENDING_DEPLOY` as of 2026-04-30. Manual admin progression already worked; automatic progression now flows through the DTDC poller.

- `lib/dtdc/poller.ts` infers shipment status from the latest tracking action (`mapDtdcActionToShipmentStatus`) and forwards transitions to `orders.status` via the new `dtdc_apply_status_to_order(p_order_id uuid, p_new_status text)` SECURITY DEFINER function (migration `20260427_dtdc_poller_and_serviceability_scaffold.sql`). The function refuses to move backward from terminal statuses (`delivered`, `returned`, `cancelled`).
- The poller is invoked every batch by `/api/cron/dtdc-poll` and idempotently upserts events with `(shipment_id, event_at, action)` as the conflict key, so re-polls don't double-write.

Closure depends on the user scheduling pg_cron (see snippet below) and providing real DTDC tracking creds.

**What is happening:** Admin order status dropdown updates only React state, DTDC tracking updates only `dtdc_shipments`, and no cron/webhook progresses `orders.status`.

**Why it matters:** Customers see paid orders stuck forever; reorder buttons never appear; admin fulfillment metrics are useless.

**How it is encountered:** A paid customer opens My Orders and sees the order still marked Paid after fulfillment activity.

**Likely root cause:** Admin UI was built before backend persistence, and shipment status was not integrated back to order status.

**Blast radius:** Every paid order.

**Confirmation:** Run `SELECT status, COUNT(*) FROM orders GROUP BY status;` and inspect admin status update handler.

**Recommended fix:** Persist admin status changes to `orders`, map DTDC shipment events to order statuses, and add proactive tracking polling per C-14.

**Follow-on work:** Send shipped/delivered emails and update customer lifecycle stats.

**Confidence:** `[VERIFIED-CODE]`, `[VERIFIED-DB]`

### C-14 - Shipment tracking only updates when a customer clicks

**Current validation status:** `SOLVED_PENDING_DEPLOY` as of 2026-04-30.

- `app/api/cron/dtdc-poll/route.ts` is the new poller endpoint (`runtime = "nodejs"`, `maxDuration = 60`, `POLL_BATCH_SIZE = 25`, `STALE_AFTER_MINUTES = 20`). It selects active shipments where `status NOT IN (delivered, cancelled, rto)` and `last_polled_at IS NULL OR < cutoff`, then calls `pollSingleShipment` for each.
- Idempotent: events are upserted with `(shipment_id, event_at, action)` and `last_polled_at` is bumped even when the carrier call fails so the loop doesn't hot-loop on a bad AWB.
- On status transitions, `notifyTransition` (in `lib/dtdc/notifications.ts`) sends customer email via SES (always when address has email) and a WhatsApp template message gated by `DTDC_NOTIFY_VIA_WHATSAPP=true`. Templates: `WA_TPL_SHIPPED`, `WA_TPL_OUT_FOR_DELIVERY`, `WA_TPL_DELIVERED` (defaults `order_shipped`, `order_out_for_delivery`, `order_delivered`).
- Auth: route requires `Authorization: Bearer ${CRON_SECRET}`.

**Deployment-time tasks:**

1. Set `CRON_SECRET` (and optionally `DTDC_AUTO_CREATE_ON_PAYMENT=true`, `DTDC_NOTIFY_VIA_WHATSAPP=true`, `WA_TPL_*`) in Netlify env.
2. In Supabase SQL editor, schedule the cron from inside Postgres:

   ```sql
   select cron.schedule(
     'dtdc-poll',
     '*/30 * * * *',
     $$ select net.http_post(
          url := 'https://www.madenkorea.com/api/cron/dtdc-poll',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer <CRON_SECRET>'
          ),
          body := '{}'::jsonb
        ); $$
   );
   ```

3. Confirm DTDC tracking creds (`DTDC_TRACK_USERNAME` / `DTDC_TRACK_PASSWORD`) are real — `.env` currently holds placeholders.

**What is happening:** DTDC tracking route runs reactively from a customer click. There is no webhook, scheduled job, or poller.

**Why it matters:** Tracking data stays stale unless customers manually request it, and admin cannot monitor stuck shipments.

**How it is encountered:** Customer opens an order days after shipment and only then fetches the first tracking snapshot.

**Likely root cause:** Reactive integration was faster to implement than scheduled tracking.

**Blast radius:** Every shipped order once fulfillment scales.

**Confirmation:** Check for Vercel Cron, Supabase scheduled function, or DTDC webhook receiver.

**Recommended fix:** Add webhook if DTDC supports it; otherwise add a scheduled job every few hours for active non-delivered shipments.

**Follow-on work:** Notify customers on major status transitions and add admin alerts for stuck shipments.

**Confidence:** `[VERIFIED-CODE]`

### C-15 - Signup Terms and Privacy links go to 404

**What is happening:** Register page links to `/legal/terms` and `/legal/privacy`, while the actual pages are `/terms` and `/privacy`.

**Why it matters:** Users evaluating legal consent hit 404 before registration, weakening trust and possibly agreement enforceability.

**How it is encountered:** New user clicks Terms or Privacy from the signup checkbox.

**Likely root cause:** Legal route naming changed but register links were not updated.

**Blast radius:** Every signup attempt where the user checks legal pages.

**Confirmation:** Open `/auth/register` and click both legal links.

**Recommended fix:** Update hrefs to `/terms` and `/privacy`; optionally add redirects from old `/legal/*` paths.

**Follow-on work:** Open legal links in a new tab to preserve form state.

**Confidence:** `[VERIFIED-CODE]`

### C-16 - Vendor forgot-password link goes to 404

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Vendor forgot-password link points to `/auth/forgot`.

**What is happening:** Vendor login links to `/auth/forgot-password`, but the real route is `/auth/forgot`.

**Why it matters:** Vendors cannot recover accounts through the UI.

**How it is encountered:** Vendor clicks Forgot password on vendor login and lands on 404.

**Likely root cause:** Route naming drift.

**Blast radius:** Any vendor needing password recovery.

**Confirmation:** Inspect `app/vendor/(public)/login/login.tsx` and click the link.

**Recommended fix:** Change link to `/auth/forgot`.

**Follow-on work:** Test vendor login, reset, and onboarding end to end.

**Confidence:** `[VERIFIED-CODE]`

### C-17 - Contact page displays a fake phone number

**What is happening:** Contact page shows `+91 1800 123 4567`, a placeholder-looking toll-free number.

**Why it matters:** Customers may call a dead or unrelated number during urgent support moments.

**How it is encountered:** A customer opens contact page and tries to phone support.

**Likely root cause:** Template placeholder left in production UI.

**Blast radius:** Every contact page visitor.

**Confirmation:** Visit `/contact`.

**Recommended fix:** Replace with a real staffed number or remove the phone card and clearly offer email/WhatsApp.

**Follow-on work:** Add `tel:` link and support hours if a real phone number is used.

**Confidence:** `[VERIFIED-CODE]`

### C-18 - Contact page displays a fake address

**What is happening:** Contact page shows `123 Consumer Innovations Street, Mumbai, Maharashtra 400001, India`.

**Why it matters:** This damages trust and may fail e-commerce, GST, and data-fiduciary address disclosure expectations.

**How it is encountered:** Customers, auditors, B2B partners, or regulators view the contact page.

**Likely root cause:** Template placeholder was never replaced.

**Blast radius:** Every contact page visitor and regulatory review.

**Confirmation:** Visit `/contact`.

**Recommended fix:** Replace with the registered business address exactly as filed.

**Follow-on work:** Add GSTIN/CIN/state registration numbers if applicable; separate registered office and warehouse if different.

**Confidence:** `[VERIFIED-CODE]`

### C-19 - Contact page shows literal Map placeholder

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. The contact page no longer renders a map-shaped placeholder panel. Address display remains env-driven via `NEXT_PUBLIC_SUPPORT_ADDRESS`.

**What is happening:** The map area contains a grey placeholder with text `Map placeholder`.

**Why it matters:** It is an obvious production-polish failure and reinforces the fake-address problem.

**How it is encountered:** A customer scrolls the contact page.

**Likely root cause:** Placeholder UI never replaced.

**Blast radius:** Every contact page visitor.

**Confirmation:** Open `/contact` and inspect the address/map section.

**Recommended fix:** Remove the map block, add a real Google Maps embed, or use OpenStreetMap/Leaflet.

**Follow-on work:** If using Google Maps, handle consent/cookie implications for GDPR regions.

**Confidence:** `[VERIFIED-CODE]`

### C-20 - `/debug/whoami` debug page is exposed

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `/api/debug/whoami` returns 404 in production, and `/debug/whoami` now calls `notFound()` in production before rendering the development-only debug client UI.

**What is happening:** `/debug/whoami` and `/api/debug/whoami` expose a debug auth surface with sign-in and session state.

**Why it matters:** Public debug routes attract scanners and expose an unplanned auth-testing surface.

**How it is encountered:** Directory-busting or manual browsing finds `/debug/whoami`.

**Likely root cause:** Supabase auth integration debug route was not removed.

**Blast radius:** Any internet visitor.

**Confirmation:** Visit `/debug/whoami` in a production-like environment.

**Recommended fix:** Delete `app/debug/` and `app/api/debug/`, or gate them to development/admin.

**Follow-on work:** Grep route handlers for `debug`, `test`, and `sandbox`; add smoke test asserting no production debug pages.

**Confidence:** `[VERIFIED-CODE]`

### C-21 - Home page hero banners have no destination URLs

**Current validation status:** `OPEN` re-confirmed against live DB on 2026-04-25. `home_banners` has 6 rows total, 2 active. **All 6** rows have `link_url IS NULL`, including both active banners. CMS schema supports `link_url`; the bug is purely live-data state. Backfill required.

**What is happening:** Earlier DB audit found all `home_banners.link_url` values were null, including active banners.

**Why it matters:** Hero banners are large conversion targets. If clicks do nothing or go to null/anchor paths, homepage engagement is wasted.

**How it is encountered:** Home visitor clicks a hero/banner and gets no meaningful navigation.

**Likely root cause:** Banner CMS did not require link URLs or seed data omitted them.

**Blast radius:** Every home page visitor.

**Confirmation:** Query active home banners and inspect `link_url`.

**Recommended fix:** Backfill link URLs, validate them in admin, and render null-link banners as non-interactive.

**Follow-on work:** Track banner CTR and use scheduled banner windows.

**Confidence:** `[VERIFIED-DB]`

### C-22 - Home page banners have null alt text

**Current validation status:** `PARTIAL` (revised) on 2026-04-25. Live check shows `home_banners.alt` is `NOT NULL` in schema, and 0 rows have empty `alt` — the original "alt null" finding is no longer accurate, so the accessibility-blocking version of this bug is closed. `title` is null/empty for all 6 rows; that is lower-stakes (SEO/admin label). Track remaining `title` backfill as a content task.

**What is happening:** Earlier DB audit found `home_banners.alt` and `home_banners.title` null.

**Why it matters:** Non-decorative banner images need accessible text alternatives and useful SEO context.

**How it is encountered:** Screen reader users hear unlabeled images; crawlers lack image context.

**Likely root cause:** Banner CMS did not require alt text.

**Blast radius:** Screen reader users and search/image indexing.

**Confirmation:** Query `home_banners` for `alt` and `title`.

**Recommended fix:** Backfill meaningful alt text, require it on save, and fall back to `Promotional banner` if missing.

**Follow-on work:** Run axe-core across the home page and audit product image alts.

**Confidence:** `[VERIFIED-DB]`

### C-23 - Live catalog is effectively empty

**Current validation status:** `OPEN` re-confirmed against live DB on 2026-04-25. Live counts: **122 total products, 14 published, 5 published+in-stock, 9 published+OOS, 108 unpublished**. The original audit's "1 in stock" has improved to 5; the storefront is still effectively empty for retail traffic.

**What is happening:** Earlier DB audit found 106 total products, 14 published, and only 1 both published and in stock. Trending and featured products were out of stock.

**Why it matters:** The site looks like a storefront but has almost nothing buyable, creating a bad first impression and failed purchase expectations.

**How it is encountered:** Every home, best-seller, shop-199, category, or product-list visitor.

**Likely root cause:** Products are drafts, awaiting stock, content, or compliance readiness.

**Blast radius:** Every visitor.

**Confirmation:** Count products by `is_published` and `stock_qty > 0`.

**Recommended fix:** Hold launch until enough products are published/in stock, launch softly with clear restock/preorder messaging, or unpublish out-of-stock items.

**Follow-on work:** Add inventory workflow, auto-unpublish or hide OOS, and stock-notification email capture.

**Confidence:** `[VERIFIED-DB]`

### C-24 - Most brands lead to empty pages

**Current validation status:** `OPEN` re-confirmed against live DB on 2026-04-25. Live: **28 total brands, 4 with published products, 24 with none**. `/brands` page already filters to brands-with-published-products (see C-06), so the `/brands` landing surface is mitigated. Header brand menu, home `BrandCarousel`, and any other surface that joins `brands` without the same filter still need a live check.

**What is happening:** Earlier DB audit found only 4 of 23 brands had published products, while all brands appeared in public navigation/carousel.

**Why it matters:** Customers click advertised brands and land on empty pages, which looks like the store does not carry what it claims.

**How it is encountered:** Home BrandCarousel or header brands menu.

**Likely root cause:** Brands were seeded before products were populated.

**Blast radius:** Every brand-navigation user and SEO for thin brand pages.

**Confirmation:** Count brands with published products.

**Recommended fix:** Filter public brand navigation to brands with at least one published, optionally in-stock, product.

**Follow-on work:** Add `is_active` for brands and brand-specific hero assets once populated.

**Confidence:** `[VERIFIED-DB]`

### C-25 - Brand named Made in Korea conflicts with store identity

**Current validation status:** `PARTIAL` as of 2026-04-25. `/brands` page filters out the conflicting brand from public display (see C-06). Other brand surfaces (header brands menu, home `BrandCarousel`) and the underlying DB row should be confirmed live; if the row should be deleted/renamed at the data layer, that work remains.

**What is happening:** Earlier DB audit found a brand row named `Made in Korea` with slug `made-in-korea`.

**Why it matters:** Customers cannot distinguish store name from brand name; brand identity becomes muddy.

**How it is encountered:** Brand navigation or carousel.

**Likely root cause:** Placeholder/house brand row or a real brand name collision.

**Blast radius:** Anyone using brand navigation.

**Confirmation:** Query brands where name contains `made in korea`.

**Recommended fix:** Delete placeholder, rename to a distinct house-brand name, or add clear disambiguation if it is a real brand.

**Follow-on work:** Decide canonical store naming as part of M-16.

**Confidence:** `[VERIFIED-DB]`

### C-26 - Verified purchase badge is unreachable

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `app/api/reviews/create/route.ts` requires the user to have a qualifying paid/shipped/delivered order containing the product before allowing the insert (returns `PURCHASE_REQUIRED` otherwise) and sets `is_verified_purchase: true` on the row. The badge surface in `app/products/[slug]/product.tsx` already reads this field. Note: the current flow makes every legitimate review verified-by-default; if there is a need to also support unverified reviews, that is a separate scope decision rather than the original "badge is unreachable" bug.

**What is happening:** UI supports `is_verified_purchase`, but no code, trigger, or admin process sets it.

**Why it matters:** Verified-purchase badges are a major review trust signal. A permanently absent badge weakens review credibility.

**How it is encountered:** Customers read reviews and never see verified purchase.

**Likely root cause:** Schema anticipated the feature but purchase-verification logic was not finished.

**Blast radius:** Every review.

**Confirmation:** Count product reviews where `is_verified_purchase = true`.

**Recommended fix:** Add DB trigger or server logic that sets `is_verified_purchase` when the user has a paid/shipped/delivered order containing the product.

**Follow-on work:** Add verified-first sort/filter and optional moderation/verification policy.

**Confidence:** `[VERIFIED-DB]`

### C-27 - Any logged-in user can review any product

**What is happening:** Earlier audit found the review insert policy only requires authenticated role. It does not require purchase, rate limit, or moderation.

**Why it matters:** Review spam, review bombing, fake positive reviews, and regulatory risk around unverified reviews.

**How it is exploited:** Throwaway accounts post reviews for products they never purchased.

**Likely root cause:** Minimal early RLS policy was never tightened.

**Blast radius:** Every product review.

**Confirmation:** Inspect `pg_policies` for `product_reviews` insert policy.

**Recommended fix:** Require user ownership, require a qualifying order or label unverified reviews, default status to pending, and enforce one review per user/product.

**Follow-on work:** Add admin moderation, report-review button, and optional moderation API.

**Confidence:** `[VERIFIED-DB]`

### C-28 - Degraded product page has Share options coming soon

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25 for customer-facing behavior. `app/product/[slug]/page.tsx` redirects to `/products/[slug]` and preserves query params, so customers cannot reach the legacy page's "Share options coming soon" button through `/product/{slug}`. Full removal of the legacy files remains tracked under M-17.

**What is happening:** Legacy `/product/[slug]/product.tsx` share button shows a toast saying share options are coming soon.

**Why it matters:** Referral users hit an unfinished feature at a high-value marketing moment, while the full `/products` page already has sharing.

**How it is encountered:** Referral traffic lands on `/product/{slug}` and taps Share.

**Likely root cause:** Legacy page was never updated after the full product page gained sharing.

**Blast radius:** Referral-traffic visitors who use Share.

**Confirmation:** Inspect the share handler in `app/product/[slug]/product.tsx`.

**Recommended fix:** Retire legacy route by redirecting `/product` to `/products`, or port the share dialog.

**Follow-on work:** Complete product-route consolidation in M-17.

**Confidence:** `[VERIFIED-CODE]`

### C-29 - Search autocomplete shows nothing for zero-result queries

**What is happening:** Autocomplete dropdown renders only when `suggestions.length > 0`; no loading or empty state appears.

**Why it matters:** Users interpret no dropdown as broken search, especially on slow networks or typo queries.

**How it is encountered:** Type a misspelled or random query in header search.

**Likely root cause:** Happy-path-only component condition.

**Blast radius:** Every failed or slow search; often a large share of searches.

**Confirmation:** Type a query that returns no matches and observe no dropdown.

**Recommended fix:** Render dropdown whenever query length is sufficient, with loading, results, and empty states. Offer a button to search full products for the exact query.

**Follow-on work:** Add fuzzy matching, popular/recent searches, and analytics for zero-result queries.

**Confidence:** `[VERIFIED-CODE]`

### C-30 - No Add-to-Wishlist UI anywhere

**What is happening:** Product detail heart button is commented out and `ProductCard` has no heart button.

**Why it matters:** Even if wishlist storage were fixed, the feature remains unreachable.

**How it is encountered:** Customers expect a heart/save button and cannot find one.

**Likely root cause:** UI was hidden because the data flow was incomplete.

**Blast radius:** Every customer expecting wishlist functionality.

**Confirmation:** Inspect product detail and card components for wishlist controls.

**Recommended fix:** Restore wishlist UI only after C-03 data-source mismatch is resolved.

**Follow-on work:** Add saved-state visuals and auth prompt for guest users.

**Confidence:** `[VERIFIED-CODE]`

### C-31 - Any customer can promote themselves to admin

**Current validation status:** `SOLVED` 2026-04-27 (Batch 8). Migration `block_non_admin_role_changes` applied live. New `before update` trigger on `public.profiles` raises an exception when a non-admin caller tries to change the `role` column. Service-role / direct-DB calls bypass (`auth.uid() is null`) so admin tooling and migrations still work. The customer-facing exploit path (`update profiles set role = 'admin' where id = auth.uid()`) now fails with `Only admins can change profiles.role`.

**Earlier status:** `OPEN` **critical** re-confirmed against live DB on 2026-04-25. Live `pg_policy` lists two UPDATE policies on `public.profiles`:

- `own profile update` — `USING (id = auth.uid())`, no `WITH CHECK`.
- `profiles_update_own` — `USING (auth.uid() = id)`, `WITH CHECK (auth.uid() = id)`.

Neither restricts which columns may be updated, so any authenticated user can run `update profiles set role = 'admin' where id = auth.uid()` and pass both policies. This is full app compromise. Add a `BEFORE UPDATE` trigger that blocks role changes by non-admins, or move roles to a protected `user_roles` table.

**What is happening:** Earlier DB audit found broad self-update policy on `profiles`; users can update their own `role` to `admin`. `is_admin()` checks `profiles.role`.

**Why it matters:** This is full admin compromise from a normal customer account: order PII, inventory, prices, roles, email tools, refunds, and dashboards.

**How it is exploited:** Register, then directly update your profile role through Supabase client calls.

**Likely root cause:** "Users can update own profile" policy did not protect privileged columns.

**Blast radius:** Full application compromise.

**Confirmation:** Inspect `pg_policies` for `profiles` update policy and test in a safe dev environment.

**Recommended fix:** Add a trigger blocking role changes by non-admins, or move roles to a protected `user_roles` table with admin-only write policies. The protected table is cleaner long term.

**Follow-on work:** Audit existing admins, add role-change audit log, and protect other privileged profile fields.

**Confidence:** `[VERIFIED-DB]`

### C-32 - Shipping fee can be manipulated by client

**Current validation status:** `SOLVED` 2026-04-27 (Batch 8). `app/api/checkout/calc-totals/route.ts` no longer reads `body.shippingFee`. The `requestedShippingFee` override path is removed entirely; shipping fee is always the server-computed `computeShippingFee(subtotal, activeMembership)` rounded via `roundMoney()`. Combined with the C-33 fix already in place from Batch 6, both halves of the original revenue-loss exploit chain are now closed.

**Earlier status:** `OPEN` re-confirmed on 2026-04-25. `app/api/checkout/calc-totals/route.ts` still reads `body.shippingFee` (lines 35-38) and substitutes it for the server-computed `computeShippingFee(...)` value when present (lines 225-227). The exploit path described below still applies. Because this value is then persisted to `orders.total`, it also indirectly defeats the C-33 fix in `/api/razorpay/create`, which trusts `order.total` from the database — fix C-32 first, otherwise C-33's protection is incomplete.

**What is happening:** `/api/checkout/calc-totals` accepts `shippingFee` from the request body and uses it instead of the computed server fee when present.

**Why it matters:** A customer can set shipping to zero on orders that should pay shipping.

**How it is exploited:** Intercept/replay totals request with `{ "shippingFee": 0 }`.

**Likely root cause:** Client-sent display value was trusted instead of verified.

**Blast radius:** Every checkout.

**Confirmation:** Inspect `app/api/checkout/calc-totals/route.ts` for requested shipping override.

**Recommended fix:** Always compute shipping server-side, or reject requests where client value does not match server calculation.

**Follow-on work:** Add tests for manipulated money fields and audit all checkout routes for client-trusted amounts.

**Confidence:** `[VERIFIED-CODE]`

### C-33 - Razorpay create endpoint trusts client-supplied total

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `app/api/razorpay/create/route.ts` resolves the authenticated user from cookies, looks up the order via service-role client, rejects when `order.user_id !== userId`, rejects orders not in `created`/`pending_payment` status, and uses `order.total` (falling back to subtotal + server shipping − discount) to compute the Razorpay paise amount. The endpoint no longer accepts UI totals. **Caveat:** this protection is only as strong as the values stored on the order row. Until C-32 is fixed, an attacker can still influence `order.total` upstream via `calc-totals`.

**What is happening:** `/api/razorpay/create` accepts UI total/shipping values and uses them to create the Razorpay order amount.

**Why it matters:** A customer can pay a tiny amount for an expensive cart.

**How it is exploited:** Intercept Razorpay create request and change `ui_total` to a lower value.

**Likely root cause:** Payment endpoint passes client display total to Razorpay instead of recomputing server-side.

**Blast radius:** Catastrophic revenue loss if exploited.

**Confirmation:** Inspect `app/api/razorpay/create/route.ts`.

**Recommended fix:** Recompute totals from authenticated cart/server state and ignore client totals.

**Follow-on work:** Log mismatches as fraud signals and audit historical order totals against item totals.

**Confidence:** `[VERIFIED-CODE]`

### C-34 - RLS disabled on order-related tables

**Current validation status:** `OPEN` re-confirmed against live DB on 2026-04-25. `pg_class.relrowsecurity` is `false` on `orders`, `order_items`, `customers`, `user_memberships` — exactly as the original audit reported. `orders` and `order_items` already have ownership policies defined (`orders read own`, `orders update own`, `order_items read own`, etc.); enabling RLS will activate them. Test all customer/admin order flows immediately after enabling, because some routes that relied on open access may break. C-42 (added in Batch 7) tracks the broader scope of public tables without RLS, including `app_admins`, `password_reset_tokens`, and the `whatsapp_*` set.

**What is happening:** Earlier DB audit found RLS disabled on `orders`, `order_items`, `customers`, and `user_memberships`.

**Why it matters:** Policies are not enforced when RLS is off. Browser Supabase queries can expose data unless every query filters manually.

**How it is encountered/exploited:** Any client query against these tables may return unauthorized rows if not filtered.

**Likely root cause:** RLS may have been disabled during seeding/import and not re-enabled.

**Blast radius:** Every row in those tables.

**Confirmation:** Query `pg_class.relrowsecurity` for the affected tables.

**Recommended fix:** Enable RLS and add owner/admin policies. Test thoroughly because enabling RLS may break routes that relied on open access.

**Follow-on work:** Audit all public tables for RLS state.

**Confidence:** `[VERIFIED-DB]`

### C-35 - Withdrawn debug leak claim

**Current validation status:** `WITHDRAWN` as of 2026-04-24. Keep out of the open remediation list unless new evidence appears.

**What is happening:** Earlier report included `?debug=1` on Razorpay verify leaking internal state, but this was later tested and did not behave as described.

**Why it matters:** It should not consume remediation time as written.

**How it is encountered:** Treat only as a lead to grep for debug branches.

**Likely root cause:** Pre-compaction note carried forward without re-verification.

**Blast radius:** None confirmed.

**Confirmation:** Grep route handlers for `debug`.

**Recommended fix:** Remove from active remediation plan unless new evidence appears.

**Follow-on work:** Keep C-20 debug route cleanup separate.

**Confidence:** `[UNVERIFIED]`, withdrawn as stated.

### C-36 - K-Plus endpoints trust client-supplied userId

**What is happening:** `/api/membership/create-order` and `/api/membership/verify` read `userId` from request body without verifying it matches the authenticated session.

**Why it matters:** Membership purchase can target another user ID. Practical abuse may be limited, but the authorization pattern is unsafe.

**How it is exploited:** Intercept membership request and replace `userId`.

**Likely root cause:** Backend reused frontend-supplied current user ID instead of resolving session server-side.

**Blast radius:** Any K-Plus membership purchase.

**Confirmation:** Inspect both membership route handlers for body `userId`.

**Recommended fix:** Resolve authenticated user from cookies/session in the route and ignore body user IDs.

**Follow-on work:** Grep API routes for `body.userId`, `{ userId }`, and similar trust patterns.

**Confidence:** `[VERIFIED-CODE]`

### C-37 - Password change does not require current password

**What is happening:** Settings page calls `supabase.auth.updateUser({ password })` without collecting or verifying the current password.

**Why it matters:** Anyone with temporary session access can lock the real user out.

**How it is exploited:** Use an unlocked/shared device session to change password.

**Likely root cause:** Supabase allows password update from an authenticated session; UI did not add re-authentication.

**Blast radius:** Every authenticated account on a shared or compromised session.

**Confirmation:** Log in, change password in settings, and observe no current-password field.

**Recommended fix:** Add current password input and re-authenticate before update.

**Follow-on work:** Send password-change notification email and consider invalidating other sessions.

**Confidence:** `[VERIFIED-CODE]`

### C-38 - Promo codes have no usage cap enforcement

**What is happening:** Earlier audit found `get_promo_details`/`validate_promo` do not check `uses < max_uses`, and Razorpay verify increments with `.update({ uses: undefined })`, which is a no-op.

**Why it matters:** Usage-capped campaigns can be redeemed unlimited times.

**How it is exploited:** Reuse any active promo code repeatedly.

**Likely root cause:** Cap check and atomic increment were never completed.

**Blast radius:** Every promo code with max-use limits.

**Confirmation:** Inspect RPC definitions and Razorpay verify route.

**Recommended fix:** Add max-use conditions to promo validation RPCs and increment uses with an atomic DB function.

**Follow-on work:** Add per-user limits, redemption table, rate-limited validation, and historical promo audit.

**Confidence:** `[VERIFIED-DB]`, `[VERIFIED-CODE]`

### C-39 - Potentially leaked API keys

**Current validation status:** `OPEN` — remediation handed off 2026-04-27 (Batch 8). Working-tree `.env` scanned and inventoried; it contains real production-grade credentials (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `RAZORPAY_KEY_SECRET` on a `rzp_test_` prefix, AWS SES, WhatsApp Cloud, Meta App Secret, DTDC Shipsy). `.env` is correctly listed in `.gitignore` (line 28). **No `.git` directory in this working tree** — git-history check + credential rotation must be done by the repo owner. Full step-by-step checklist in `SECRETS_REMEDIATION.md`. C-39 stays open until the checklist is completed.

**What is happening:** Earlier audit observed `.env` with production Razorpay, AWS SES, Meta/Facebook, and Supabase service-role credentials. If committed, credentials are exposed through repo history.

**Why it matters:** Service-role, payment, email, and social tokens can cause full data compromise, fraudulent operations, spam, or account abuse.

**How it is exploited:** Anyone with repo access or a public history clone extracts secrets.

**Likely root cause:** Local env file may have been committed or shared.

**Blast radius:** Catastrophic if secrets were committed or leaked.

**Confirmation:** Run git history checks for `.env` and secret-like strings.

**Recommended fix:** If `.env` was ever committed, rotate every credential immediately, purge history with BFG/filter-repo, and audit provider logs.

**Follow-on work:** Add secret scanning, pre-commit checks, and document rotation procedures.

**Confidence:** `[VERIFIED-CODE]` for observed file existence/content in earlier audit; current git exposure must be checked.

## Moderate Issues

Moderate issues cause friction, data-integrity gaps, feature incompleteness, or UX confusion.

### M-01 - Checkout does not save shipping address for reuse

Address data is saved only to `orders.address_snapshot`, not the reusable `addresses` table. Return customers must retype addresses and account settings show no saved addresses. Fix by upserting checkout address into `addresses`, preselecting default addresses on checkout, and validating serviceability before payment. Confidence: `[VERIFIED-CODE]`, `[VERIFIED-DB]`.

### M-02 - Guest checkout redirect gives no context

Guests can add to cart, but checkout redirects to `/auth/login?redirect=/checkout` without explanation. Add a reason parameter and show a login-page banner explaining the cart is preserved. Longer term, consider true guest checkout. Confidence: `[VERIFIED-CODE]`.

### M-03 - No dedicated real order-success screen

After payment, users land on `/account/orders`. Existing `/order/success` is unreachable and generates fake order numbers. Build `/order/success?id=<order_id>` that loads the real order with ownership check, shows confirmation, order number, items, total, next steps, and cross-sells. Confidence: `[VERIFIED-CODE]`.

### M-04 - Active K-Plus members can repurchase without warning

The membership create-order endpoint can indicate `alreadyActive`, but the frontend still opens Razorpay. Show a confirmation modal explaining the existing expiry and that purchase will extend membership. Confidence: `[VERIFIED-CODE]`.

### M-05 - K-Plus price is hardcoded in server

**Current validation status:** `PARTIAL` as of 2026-04-25. `lib/membership.ts` now exports `MEMBERSHIP_PRICE = 199` and `MEMBERSHIP_DURATION_DAYS = 90`, and `app/api/membership/create-order/route.ts` derives the Razorpay paise amount via `Math.round(MEMBERSHIP_PRICE * 100)` from that constant. A stray `amount: 199` literal still appears in `app/api/membership/verify/route.ts` line 108 and should be switched to the constant. The recommended longer-term fix — moving price/duration to a `membership_plans` DB table — is still future work.

Membership route hardcodes `19900` paise. Move price/duration source of truth to `membership_plans` or shared constants and derive Razorpay amount server-side. Confidence: `[VERIFIED-CODE]`.

### M-06 - Reorder button is effectively hidden

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `app/account/orders/[orderId]/page.tsx` (line 433) shows the Reorder button whenever `items.some((i) => !!i.product_id)`. It is no longer gated on `status === 'delivered'`, so the C-13 ordering gap no longer hides reorder.

Orders list shows Reorder only when status is `delivered`, but C-13 means orders never reach delivered. Fix order progression first or loosen the gate to paid/shipped if acceptable. Confidence: `[VERIFIED-CODE]`.

### M-07 - Payment info never shows on order detail

**Current validation status:** `SOLVED` as of 2026-04-30. `app/api/razorpay/verify/route.ts` now writes a row to the `payments` table on every successful capture: `provider='razorpay'`, `provider_payment_id`, `provider_order_id`, `method`, `status='captured'`, `amount`, `currency`, `signature`, raw payload. The insert is wrapped in try/catch and logged to `dbg` so a transient payments-table failure cannot take down the verify path. The customer-facing UI fallback to `orders.payment_reference` stays in place for old orders pre-dating this fix.

Order detail queries `payments`, but earlier DB audit found no rows written there. Either insert payment rows during Razorpay verification or display payment reference from `orders`. Writing payments is better for reporting and refunds. Confidence: `[VERIFIED-DB]`.

### M-08 - Support email is misspelled in multiple ways

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Remaining vendor support email now uses `support@madenkorea.com`.

The audit found `info@madekorea.com`, `info@makenkorea.com`, and correct `info@madenkorea.com`. Centralize a `SUPPORT_EMAIL` constant and replace all hardcoded variants. Confidence: `[VERIFIED-CODE]`.

### M-09 - Order failure redirect only handles signature verification failure

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `lib/hooks/useRazorpayCheckout.ts` now routes the three Razorpay failure paths separately:

- `modal.ondismiss` → `/order/failure?reason=cancelled&order_id=...`
- `payment.failed` event → `/order/failure?reason=failed&order_id=...`
- Server-side verification failure → `/order/failure?reason=verification&order_id=...`

The original "only signature failure handled" gap is closed. The `/order/failure` page itself can still be improved to render distinct copy and retry/cleanup actions per `reason`; that polish is follow-on work.

Common payment cancellation leaves users on checkout with a `pending_payment` order. Handle Razorpay modal dismiss with a clear failure/cancel path, optional order cancellation cleanup, and retry instructions. Confidence: `[VERIFIED-CODE]`.

### M-10 - Registration does not handle email-confirmation mode

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Signup now handles the no-session email verification case with a persistent notice and success toast.

If Supabase requires email confirmation, signup returns no session and fallback sign-in fails with raw "Email not confirmed." Detect no-session signup, show a persistent "check your email" state, and add resend. Confidence: `[VERIFIED-CODE]`.

### M-11 - Admin review moderation reads role from wrong auth field

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Product review moderation reads `profiles.role` to determine admin controls.

Product page checks `session.user.app_metadata.role`, but roles live in `profiles.role`. Real admins may not see moderation controls. Fetch role from the app role source; update again if C-31 moves roles. Confidence: `[VERIFIED-CODE]`.

### M-12 - Phone number validation is weak

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Checkout now has JS validation plus HTML pattern/title validation for Indian mobile numbers.

Checkout phone input has length limits but no robust Indian mobile validation. Add HTML pattern and JS validation for 10 digits starting with 6-9. Confidence: `[VERIFIED-CODE]`.

### M-13 - `cart_clear()` RPC errors on every payment

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Cart clear API now catches the RPC normally and falls back to table deletes without throwing typed `.catch()` errors.

Earlier DB audit found `cart_clear()` deletes from nonexistent `user_cart_lines`, while server-side `cart_clear_for_user()` uses `cart_items`. Remove the client call or fix the RPC; server-side clearing is preferred. Confidence: `[VERIFIED-DB]`.

### M-14 - Login password visibility button has conflicting handlers

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Login password visibility is click-to-toggle only; no competing mouse/touch handlers remain.

The login password peek control mixes click-to-toggle with press-and-hold handlers, causing flicker/confusing behavior. Pick one pattern, preferably click-to-toggle, and remove competing mouse/touch handlers. Confidence: `[VERIFIED-CODE]`.

### M-15 - Shop at 199 ignores sale-window dates

`/shop-199` filters by sale price but not `sale_starts_at`/`sale_ends_at`, so expired sale prices may appear. Add active date filters and ensure product detail uses the same sale-validity logic. Confidence: `[VERIFIED-CODE]`.

### M-16 - Store name is spelled multiple ways

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25 for store-brand copy. Footer alt text, Razorpay order confirmation email, and influencer request copy now use `MadenKorea`. Remaining `Made in Korea` strings are product-origin/admin/mock-data labels rather than customer-facing store-brand references.

The audit found variants including Made Korea, Made in Korea, MadenKorea, Maden Korea, and MadeNKorea. Decide canonical brand/legal names, export constants, and do a copy/metadata sweep. Confidence: `[VERIFIED-CODE]`.

### M-17 - Two product route directories coexist

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. The duplicate legacy product implementation file was deleted. `/product/[slug]/page.tsx` remains only as a redirect shim to canonical `/products/[slug]`.

`/product/[slug]` and `/products/[slug]` are parallel implementations with different feature sets. Consolidate internal links to `/products`, redirect `/product`, and delete the legacy route after checking external traffic. Confidence: `[VERIFIED-CODE]`.

### M-18 - Invoice footer shows wrong domain

Invoice footer says `www.madeinkorea.com` instead of `madenkorea.com`. Replace with canonical domain to avoid customer and tax-document confusion. Confidence: `[VERIFIED-CODE]`.

### M-19 - Footer Threads link uses Twitter icon and tracking parameter

**Current validation status:** `SOLVED` / `SOLVED_AFTER_VALIDATION`. Footer uses `FaThreads`, and 2026-04-25 verification found the public Threads URL is clean with no `xmt=` tracking token.

Threads social link uses Twitter icon and contains an `xmt=` tracking parameter. Use a correct icon/label and clean URL. Confidence: `[VERIFIED-CODE]`.

### M-20 - Login errors expose raw Supabase messages

Raw auth errors create bad UX and possible email enumeration. Map errors to friendly messages, keep wrong-email/wrong-password ambiguous, and give action for unconfirmed email. Confidence: `[VERIFIED-CODE]`.

### M-21 - Forgot-password redirects before persistent success confirmation

After reset email send, the page redirects to login and the toast is easy to miss. Stay on the page and show a persistent check-your-inbox state with resend. Confidence: `[VERIFIED-CODE]`.

### M-22 - Category and brand pages lack filters/sort controls

Category sorting is unusual and brand pages lack sort/filter tools. Add standard e-commerce filters: sort, price range, brand filter for categories, and in-stock toggle. Store filter state in URL params. Confidence: `[VERIFIED-CODE]`.

### M-23 - Wishlist empty state fires incorrectly on filter misses

Wishlist search with zero matches shows "Your wishlist is empty" even if items exist. Separate true empty state from no-filter-results state. Confidence: `[VERIFIED-CODE]`.

### M-24 - Cart silently drops unpublished products

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Cart keeps unavailable items visible, explains the issue, excludes them from totals, and blocks checkout until removed.

Cart filters out unpublished product rows, making items disappear without explanation. Show unavailable items, explain the issue, and block checkout until removed. Confidence: `[VERIFIED-CODE]`.

### M-25 - Cart quantity and remove buttons are silent

Cart mutation buttons lack disabled/loading/error states and undo. Add per-row in-flight states, error feedback, and undo toast for removals. Confidence: `[VERIFIED-CODE]`.

### M-26 - Cart totals recalculation is invisible

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. The cart order summary renders a spinner, opacity transition, and updating message while totals recalculate.

`loadingTotals` exists but is not rendered. Users see stale totals flicker. Dim totals or show a small spinner while recalculating. Confidence: `[VERIFIED-CODE]`.

### M-27 - Product detail Add to Cart lacks in-flight/error states

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Product detail Add to Cart already has in-flight state, disabled state, try/catch, and success/error toasts.

Add to Cart awaits `addItem` and always shows success, without disabling the button or catching errors. Add `isAdding`, try/catch, disabled state, and error toast. Confidence: `[VERIFIED-CODE]`.

### M-28 - ProductCard Add to Cart has same issue

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `ProductCard` already has `isAddingToCart`, disables Add to Cart while in flight, wraps `addItem` in try/catch, and shows success/error toasts.

Apply the M-27 in-flight/error handling pattern to `ProductCard.tsx`. Confidence: `[VERIFIED-CODE]`.

### M-29 - Review submit has no full in-flight state

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Review form has a `submitting` state and disables actions across the full submit cycle.

Review submit is disabled during photo upload but not the DB insert, allowing double-click duplicate errors. Add a `submitting` state for the whole submit flow. Confidence: `[VERIFIED-CODE]`.

### M-30 - Destructive actions lack confirmation or undo

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Review deletion now asks for confirmation.

Cart Remove, Delete Address, Delete Review, Remove from Wishlist, and Remove Selected are single-click destructive actions. Use AlertDialog for irreversible actions and undo toasts for softer removals. Confidence: `[VERIFIED-CODE]`.

### M-31 - Saved Addresses empty state lacks CTA

Settings Addresses empty state says no saved addresses but does not include its own Add Address button. Add a direct "Add your first address" CTA. Confidence: `[VERIFIED-CODE]`.

### M-32 - Settings save/delete/default buttons have no loading state

Profile/address save, delete, and set-default operations do not disable or show progress. Add loading states to prevent duplicate/racing operations. Confidence: `[VERIFIED-CODE]`.

## Minor Issues

Minor issues are polish, cleanup, and UX consistency work.

### N-01 - Contact page has no navigation entry

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Header desktop and mobile navigation now include Support links to `/contact`.

Footer Contact link is commented out and no header path exists. Restore a footer or support link so customers can reach the page. Confidence: `[VERIFIED-CODE]`.

### N-02 - `/search` with no query has no on-page input

The page says to enter a search term but provides no input, relying on header search. Add an autofocus search form when `q` is empty. Confidence: `[VERIFIED-CODE]`.

### N-03 - Search autocomplete and search page use different query logic

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `/search` now uses `search_products_tsv`, then fetches full product rows for product-card rendering while preserving the RPC match order.

Autocomplete uses `search_products_tsv`; `/search` uses `ilike`. Share one search implementation or RPC so results match. Confidence: `[VERIFIED-CODE]`.

### N-04 - Product not-found state is a dead end

Missing products show plain text only. Add search/home CTAs and suggested products. Confidence: `[VERIFIED-CODE]`.

### N-05 - `/order/success` is unreachable and fake

Existing success page is unused and generates fake `Date.now()` order numbers. Replace as part of M-03. Confidence: `[VERIFIED-CODE]`.

### N-06 - Wishlist page calls `addItem` with wrong signature

Wishlist calls `addItem(product_id, undefined, 1)` though `addItem` accepts product ID and optional quantity. Change to `addItem(product_id, 1)`. Confidence: `[VERIFIED-CODE]`.

### N-07 - Home page has dead mock-data imports

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. No live mock-data imports were found in `app/page.tsx`; only stale comments mention old mock sections.

`app/page.tsx` still imports mocks for commented sections. Remove unused imports and enable linting for unused variables. Confidence: `[VERIFIED-CODE]`.

### N-08 - Public logo filenames contain spaces

Assets like `logo gif.gif` and `madenkorea secondary logo.png` require URL encoding and can trip tooling/CDNs. Rename and update references. Confidence: `[VERIFIED-CODE]`.

### N-09 - Disabled nav items are unlabeled

Empty categories/brands are greyed out without explanation. Hide them or label as coming soon. Confidence: `[VERIFIED-CODE]`.

### N-10 - 92 of 106 products are unpublished

This may be intentional draft state, but the content team should audit and publish ready products. Confidence: `[VERIFIED-DB]`.

### N-11 - `/services` is B2B content in consumer navigation

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. `/services` was removed from desktop and mobile consumer header navigation.

CDSCO/regulatory consulting content targets brand clients, not retail shoppers. Move to B2B/partner area or remove from consumer nav. Confidence: `[VERIFIED-CODE]`.

### N-12 - Best Seller tab shows only 2 products

Sparse tab looks weak. Mark more products as trending, rename to a smaller-scale label, or hide until at least several products exist. Confidence: `[VERIFIED-DB]`.

### N-13 - Privacy policy email variants are misspelled

Same root issue as M-08. Fix through centralized support email. Confidence: `[VERIFIED-CODE]`.

### N-14 - Privacy policy last-updated date is stale

Earlier report listed `2025-10-08`. Review policy content and update date after legal/content review. Confidence: `[VERIFIED-CODE]`.

### N-15 - Threads URL contains personal/referral token

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-25. The footer URL is `https://www.threads.com/@madenkorea_` and contains no personal/referral token.

Same root issue as M-19. Remove tracking token from public footer URL. Confidence: `[VERIFIED-CODE]`.

### N-16 - Pincode input lacks autocomplete attributes

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Checkout contact/shipping inputs now include standard browser autofill attributes.

Checkout pincode lacks `autoComplete="postal-code"` and related address fields may lack browser autofill hints. Add standard autocomplete attributes. Confidence: `[VERIFIED-CODE]`.

### N-17 - Review list has no initial-load skeleton

Reviews section appears empty during async load. Add skeleton rows until initial fetch resolves. Confidence: `[VERIFIED-CODE]`.

### N-18 - Reviews section lacks aggregate summary

Individual reviews appear without average rating/review count summary. Add header using review stats. Confidence: `[VERIFIED-CODE]`.

### N-19 - Floating WhatsApp phone is hardcoded

`app/layout.tsx` hardcodes WhatsApp number. Move to env/config or CMS setting. Confidence: `[VERIFIED-CODE]`.

### N-20 - Review title placeholder is leading

**Current validation status:** `SOLVED_AFTER_VALIDATION` as of 2026-04-24. Product review title placeholder is already neutral: `Add a short summary`.

Placeholder `Great product!` biases reviews positive. Use neutral text such as `Summarize your experience`. Confidence: `[VERIFIED-CODE]`.

### N-21 - Home radial gradient may render poorly on some mobile browsers

Known CSS rendering risk on older iOS Safari. Test target devices and add fallback if artifacts appear. Confidence: `[INFERRED]`.

### N-22 - Asset typo `squar-logo.png`

**Current validation status:** `SOLVED` as of 2026-04-25. `public/square-logo.png` exists and `app/about/page.tsx` references it correctly as `/square-logo.png` in OG/metadata; no `squar-logo` typo remains in working-tree code.

Earlier report flagged an OG image path typo. Re-check current assets before changing; if present, rename/update to `square-logo.png`. Confidence: `[VERIFIED-CODE]`.

## Production Readiness Gaps

### Operational gaps

- No error tracking. Install Sentry, PostHog error tracking, or equivalent.
- No structured logging. Serverless `console.log` is weak for operations; consider Pino or platform logging.
- No health check endpoint. Add `/api/health` with DB/service connectivity checks.
- No automated test suite. Minimum E2E coverage should include registration, login, add-to-cart, checkout-to-payment, and order view.
- No CI/CD checks visible. Add lint, typecheck, build, and test gates.
- No rate limiting. Public API routes are open to abuse.
- No audit log. Admin and destructive actions need a durable record.

### India Consumer Protection and e-commerce gaps

Required public information appears incomplete or placeholder-backed:

- Legal name, principal address, and customer-care contact.
- Named Grievance Officer and acknowledgement commitment.
- Shipping, return/refund, exchange, and cancellation policies.
- Seller legal name on product pages.
- Country of origin disclosure for imported goods.
- Real expected delivery date instead of fake pincode estimate.

Recommended action:

- Publish `/policies/shipping`, `/policies/return-and-refund`, `/policies/cancellation`, and `/grievance` or equivalent.
- Add Grievance Officer contact, working support phone/email, and real registered address.
- Display seller/importer/country-of-origin details on product pages.
- Fix delivery serviceability and ETA logic.

### Digital Personal Data Protection Act gaps

Current gaps from earlier audit:

- No point-of-collection data notice.
- No named data grievance contact.
- No self-service access, correction, erasure, or export UI.
- No published retention schedule.
- No breach notification runbook.

Recommended action:

- Update privacy policy with grievance contact, retention periods, rights process, and breach-notification commitment.
- Add account settings tools for data export and account deletion.
- Add granular consent toggles for marketing, analytics, and personalization.
- Document an internal breach response runbook.

### GST and tax invoicing gaps

Customer invoice flow needs verification and likely expansion:

- GSTIN on invoice.
- HSN per line item.
- CGST/SGST/IGST breakdown.
- Unbroken invoice sequence per financial year.

Recommended action:

- Add tax fields to customer invoice schema and UI.
- Generate invoice records at payment verification.
- Verify invoice counters and annual reset behavior.

### CDSCO/imported cosmetics gaps

Audit imported cosmetic product pages for:

- Import registration number.
- Registered importer legal name.
- Manufacturing date.
- Best-before date.

### EU, UK, and California gaps if those markets are targeted

- No granular cookie consent.
- Non-essential tracking may run before consent.
- No GDPR/CCPA data-rights UI.
- No DPO/EU representative disclosures where applicable.
- No international transfer disclosures.
- No California "Do Not Sell or Share My Personal Information" link.

### Accessibility gaps

Known or likely issues:

- Null/missing banner alt text.
- Icon-only buttons may lack accessible labels.
- Toast-only errors may be missed by screen readers.
- Color contrast and focus rings need audit.
- Modal keyboard behavior should be verified.

Recommended launch baseline:

- All meaningful images have alt text.
- Form errors are inline, not only toast.
- Keyboard navigation works.
- Focus indicators are visible.
- Run axe-core and fix high-impact findings.

### PCI and email gaps

- Razorpay-hosted payment keeps card-data scope lower, but price-tampering bugs C-32/C-33 must still be fixed.
- Verify TLS, no card data in logs, and SAQ A readiness.
- Verify SPF, DKIM, and DMARC.
- Marketing emails need physical address, unsubscribe handling, and separate marketing consent.
- Verify SES bounce/complaint handling updates suppression/unsubscribe state.

## Deferred — flagged 2026-05-09 (not yet fixed)

### D-05: Per-product `influence_caps` table is not wired into checkout — flagged 2026-05-19

**Status:** Per-influencer commission cap (`influencer_profiles.commission_cap_pct`) shipped today and replaces the previous global `GLOBAL_CAP_PERCENT = 25` constant in `calc-totals`. As part of that work, the per-product cap lookup (`influence_caps`) was also removed from `calc-totals` by request — to be re-wired later as a layered cap.

**Confidence:** `[VERIFIED-CODE]`

**Current state:**

- `influence_caps` table still exists in the production schema and is preserved (no rows touched).
- [app/api/checkout/calc-totals/route.ts](app/api/checkout/calc-totals/route.ts) no longer reads from it. Only `influencer_profiles.commission_cap_pct` governs cap math today.

**When re-wiring, the rule should be:** `effectiveCap = min(influencer.commission_cap_pct, product.cap_percent)` so the influencer ceiling can never be bypassed by a permissive product row. A NULL product cap means "fall through to the influencer cap." A NULL influencer cap shouldn't happen (NOT NULL post-migration) — but if it does, the promo should be treated as ineligible (current safe-default behavior in `calc-totals`).

**Code touch points when re-wiring:**

1. `calc-totals/route.ts` — restore the `influence_caps` query against `productIds`, build `capMap`, then in the per-line loop compute `min(influencerCap, capMap.get(p.id) ?? Infinity)`.
2. No admin UI changes needed; per-product caps are seeded manually today.

**Effort estimate:** 30 min code + verification.

---

### D-04: K-Partnership commission accounting is currency-buggy for international orders — flagged 2026-05-16

**Status:** Audit performed during international-payments testing pass. Both bugs are live but only trigger when an influencer promo is redeemed on a non-INR order. India-only orders are unaffected. Full spec, recommended fix, and backfill SQL are in [INTERNATIONAL_PAYMENTS.md](INTERNATIONAL_PAYMENTS.md) → "Deferred: K-Partnership currency handling".

**Confidence:** `[VERIFIED-CODE]`

**Summary of the two coupled defects:**

1. **Commission recorded in buyer currency.** [app/api/razorpay/verify/route.ts](app/api/razorpay/verify/route.ts) line ~311 computes `commissionAmount = order.subtotal × commissionPct/100`. After the Phase 2 cutover (INTERNATIONAL_PAYMENTS.md) `order.subtotal` is in buyer currency for non-INR orders, so the resulting `order_attributions.commission_amount` is in USD/EUR/etc with `currency = orderCurrency`. Merchant pays out from India in INR — this forces a payout-time FX conversion at a worse rate than what was earned.
2. **Dashboard sums mix currencies.** [app/api/me/summary/route.ts](app/api/me/summary/route.ts) and [app/api/me/request/route.ts](app/api/me/request/route.ts) both `reduce` `commission_amount` across all rows without currency normalisation. One Polish-USD order makes the dashboard read `₹1,000 + $10 = "₹1,010"`, undercounting the foreign commission by ~99×. Same math feeds payout-availability gating.

**Single-point fix:** swap the commission base from `order.subtotal` (buyer-currency) to `order.subtotal_inr` (INR canonical, populated since Phase 2). All downstream sums become correct automatically.

**Backfill needed:** any orders placed between Phase 2 cutover and the fix date with attribution + non-INR currency. SQL UPDATE included in INTERNATIONAL_PAYMENTS.md.

**Effort (~40 min total):** 20 min code, 5 min backfill, 15 min verification.

**What's NOT broken (don't fix what isn't):** `/influencer-request` apply form, `/r/[code]` + `/rl/[id]` tracking, promo/referral code application in cart, 25% cap, `order_attributions` row creation, per-row currency display in dashboard list view.

**Adjacent (out of scope for this fix):** International influencer banking (SWIFT/IBAN), influencer-dashboard string translation, per-currency payout buckets. These are separate product decisions.

---

### D-01: PWA "Add to Home Screen" broken

**Status:** Implementation exists at [app/manifest.ts](app/manifest.ts) and is linked from [app/layout.tsx](app/layout.tsx), but install prompts do not fire on Android Chrome, and iOS Home Screen icons are visibly rescaled / distorted.

**Confidence:** `[VERIFIED-CODE]` + visually confirmed not working

**Root causes:**

1. **Icon dimensions wrong + lying about it.** `public/square-logo.png` and `public/apple-touch-icon.png` are both literal copies (same file, 95k bytes) at **353 × 318 px** — not square despite the name. Manifest declares `square-logo.png` with `sizes: "any"` (only valid for SVG) and `apple-touch-icon.png` with `sizes: "180x180"` (doesn't match actual). Strict browsers reject these entries.
2. **Missing required icon sizes.** Android Chrome's install prompt criteria require **at least one 192 × 192 PNG and one 512 × 512 PNG**. Neither exists.
3. **No service worker.** Chrome's `beforeinstallprompt` event won't fire without a registered service worker. iOS can still add via Share menu without SW but with the broken icon.
4. **No iOS-specific meta tags.** `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title` all missing from [app/layout.tsx](app/layout.tsx). Installed iOS instances look like plain browser shortcuts, not apps.
5. **No maskable icon.** Without a `purpose: "maskable"` variant, Android adaptive icons crop the logo to a circle/squircle in unpredictable ways.

**Fix work (~1–2 hrs when ready):**
- Generate proper PNG icon set from a real square logo: `icon-192.png`, `icon-512.png`, `icon-maskable-192.png` (with 80% safe-zone padding), `apple-touch-icon.png` at actual 180 × 180
- Update [app/manifest.ts](app/manifest.ts) with correct `sizes` and add maskable entry
- Add iOS meta tags to root metadata
- Add minimal service worker (`public/sw.js`) + register it from layout
- Verify install prompt fires in DevTools → Application → Manifest

---

### D-03: SES email delivery failing site-wide — **RESOLVED 2026-05-09**

**Resolution:** Root cause was confirmed to be (1) email-address identity only. Domain identity `madenkorea.com` verified in SES with Easy DKIM (3 CNAME selectors) + custom MAIL FROM `bounces.madenkorea.com` (MX + SPF TXT). Root SPF TXT updated to include `amazonses.com`. Outbound mail now signs with `d=madenkorea.com`, passes DMARC alignment, lands successfully in Gmail / Outlook. Verified via working forgot-password flow.

**Post-resolution code reverts (2026-05-09):**

- [app/contact/page.tsx](app/contact/page.tsx) — `handleSendEmail()` reverted from `mailto:` + keepalive POST back to a direct `await fetch("/api/contact", ...)` call.
- [components/InternationalOrderModal.tsx](components/InternationalOrderModal.tsx) — `submit()` reverted from `mailto:` + keepalive POST back to direct `await fetch("/api/international-order", ...)`.
- [app/api/international-order/route.ts](app/api/international-order/route.ts) — restored the styled-HTML team + customer email templates and the dual `sendEmail()` calls (non-fatal, surfaced via `email_warnings`).
- Modal copy + button label reverted (no more "Open email & submit" / "your email app will open"). Back to "Submit request" with a 24-hour quote turnaround promise.

**Cleanup still to do (low priority):**

- Delete the standalone `info@madenkorea.com` email-address identity in SES — no longer needed since the domain identity covers any `*@madenkorea.com` sender.
- Add `Reply-To` to `sendEmail()` so customer replies on order confirmations don't go to the no-reply sender.
- Add basic exponential retry on SES `Throttling` errors.

**Original problem analysis follows for reference:**

**Confidence:** `[VERIFIED-CODE]` + bounce-trace verified

**Root cause:** outbound mail is DKIM-signed with `d=amazonses.com` instead of `d=madenkorea.com`. DMARC alignment on `madenkorea.com` fails on both DKIM and SPF axes, so strict-policy receivers reject outright.

**Bounce evidence (captured earlier in session):**
```
550 5.7.1 Unauthenticated email from madenkorea.com is not accepted
due to domain's DMARC policy.
DKIM-Signature: d=amazonses.com; ...
```

**Four candidate setup problems, ordered by likelihood:**

1. **Email-address identity, not domain identity** — SES has `info@madenkorea.com` verified as an email-address identity. These can't DKIM-sign with your domain; AWS always signs them with `d=amazonses.com`. **Fix:** verify the *domain* `madenkorea.com` as an SES identity, enable DKIM, add the 3 CNAMEs AWS provides.
2. **Region mismatch** — identity verified in one region but `AWS_SES_REGION` env points to another. AWS treats the identity as unverified in the env's region.
3. **DKIM CNAMEs missing/stale in DNS** — domain identity exists, DKIM enabled, but the 3 selector CNAMEs aren't actually live at the DNS registrar.
4. **Custom MAIL FROM domain not set** — `Return-Path:` is `*@amazonses.com`, breaking SPF alignment even if DKIM is fixed. Set a custom MAIL FROM like `bounces.madenkorea.com` with the MX + SPF TXT records AWS provides.

**Code touchpoints currently failing silently or 5xx-ing:**
- [/api/contact](app/api/contact/route.ts) — contact form *(workaround: mailto, shipped)*
- [/api/auth/forgot-password](app/api/auth/forgot-password/route.ts) — password reset emails *(no workaround — customers can't reset passwords by email)*
- [/api/admin/email/send](app/api/admin/email/send/route.ts) — admin broadcasts
- [lib/dtdc/notifications.ts](lib/dtdc/notifications.ts) — shipping notifications
- [/api/razorpay/verify](app/api/razorpay/verify/route.ts) — order confirmation emails (inline SES call after payment verify)
- [/api/international-order](app/api/international-order/route.ts) — international order requests *(workaround: mailto, shipped)*

**Diagnostic checklist for the admin to walk through in AWS console:**

```
□ SES → Identities: is `madenkorea.com` (domain) verified, NOT just info@madenkorea.com?
□ Same identity: DKIM status = "Successful"?
□ Region in URL bar = AWS_SES_REGION env var?
□ DNS: `dig TXT madenkorea.com` includes `include:amazonses.com`?
□ DNS: `dig TXT _dmarc.madenkorea.com` — what is the policy? (p=reject is strict)
□ DNS: 3 DKIM CNAMEs for the selectors AWS shows are resolvable?
□ SES → Account dashboard: out of Sandbox?
□ SES → Suppression list: any of our target addresses?
□ SES → Sending statistics last 24h: bounces % vs complaints %
□ AWS_FROM_EMAIL env value: sender is on the verified domain?
```

**No code change will fix this** — fix in AWS + DNS. Once restored, the mailto fallbacks for contact and international order can be reverted to direct `sendEmail()` calls.

**Code-side improvement worth doing while we're at it** (separate, low-priority):
- Add `Reply-To` to `sendEmail()` so customer replies to order-confirmation emails go to the customer's address or `info@madenkorea.com`, not the no-reply sender.
- Add basic exponential retry on SES `Throttling` errors.

---

### D-02: Browser URL bar theme color — works inconsistently

**Status:** `viewport.themeColor: "#359fd9"` is set in [app/layout.tsx](app/layout.tsx) and `theme_color` is set in [app/manifest.ts](app/manifest.ts). Mostly a browser-side limitation rather than a code defect.

**Confidence:** `[VERIFIED-CODE]` + behavioural verified

**Browser behavior matrix:**

| Browser / context | Honours theme-color |
|---|---|
| Android Chrome (regular tab) | ✅ Yes |
| Android Chrome (incognito) | ❌ Always neutral |
| Android Chrome + system dark mode | ⚠️ May auto-invert |
| iOS Safari 15+ | ⚠️ Muted/desaturated |
| iOS Safari < 15 | ❌ Ignored |
| Desktop Chrome / Firefox / Edge | ❌ No chrome to color |
| In-app browsers (Instagram, FB) | ❌ Mostly ignored |
| Installed PWA on Android | ✅ Yes (status bar) |

**Additional polish gaps:**
- No `media="(prefers-color-scheme: dark)"` variant — dark-mode users may see Chrome auto-adapt and pick a tone that doesn't match the brand.
- On scroll, modern Android Chrome can override `theme-color` with the dominant pixel color near the top of the viewport.

**Fix work (~15 min when ready):**
- Add a second `theme-color` meta with `media="(prefers-color-scheme: dark)"` if/when we add dark theme support
- Otherwise: largely browser-side, nothing more to do

---

## Usage Notes

- Re-verify each issue before implementation, especially `[INFERRED]` and `[UNVERIFIED]` items.
- When an issue is fixed, add a status line under that issue with date, files changed, and verification run.
- Also update `CODEBASE_REFERENCE.md` for architectural or workflow changes.
- If live testing contradicts this register, trust the live test and mark the issue corrected, stale, or withdrawn.
