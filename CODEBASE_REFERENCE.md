# MadeNKorea Codebase Reference

Last verified: 2026-06-21 (added the "Backend Migrations" section and Auth/Storage/Supabase-client migration notes; the rest of the doc predates that sweep).

This is the working reference for the current app. It reflects the code in this repository, not only the older requirements and implementation summaries.

> **Heads-up for anything backend-related:** three strangler-fig backend migrations (auth, storage, database) are code-complete but not yet flipped live by default. Wherever this doc says "Supabase Auth", "Supabase Storage", or describes data flowing through Supabase, read the [Backend Migrations](#backend-migrations-flag-gated-in-progress) section below first — the active backend is selected by env flags.

## Executive Summary

MadeNKorea is a Next.js 14 App Router e-commerce application for Korean beauty and lifestyle products. It includes a customer storefront, account area, cart and Razorpay checkout, an admin portal, a vendor portal, influencer/referral tooling, K Plus membership, invoices, email campaigns, WhatsApp campaigns, and Meta/Facebook/Instagram marketing tools.

The app is no longer just mock-data based. Many core flows now call Supabase directly from client components, server components, route handlers, and RPCs. Some legacy mock-data/adapters still exist and are useful for fallback or older UI patterns.

## Backend Migrations (flag-gated, in progress)

Three independent strangler-fig migrations are moving the app off Supabase, one backend at a time. **All three are code-complete, gated behind env flags, and default to the Supabase path** — so the rest of this doc still describes the *live default* behavior unless a flag is set. Each is reversible by unsetting its flag (no data is undone; the dual-write keeps both stores in sync). Supabase remains authoritative/dual-written until each cutover lands. The companion docs in [migration/](migration/) are the authoritative detail; this section is the index.

| Migration | Flag(s) | Active backend when flag set | Status |
|---|---|---|---|
| **Auth** — Supabase Auth → NextAuth | `AUTH_BACKEND` + `NEXT_PUBLIC_AUTH_BACKEND` = `nextauth` | NextAuth (credentials/bcrypt + Google + Facebook, JWT sessions) | Code-complete (Steps A–D), gated; not flipped live by default. 53/53 users migrated 2026-06-16. |
| **Storage** — Supabase Storage → AWS S3 + CloudFront | `NEXT_PUBLIC_STORAGE_BACKEND` = `s3` (+ `NEXT_PUBLIC_MEDIA_CDN_URL`) | S3/CloudFront | Code-complete + verified (reads + uploads); not flipped by default. |
| **Database** — Supabase Postgres (authoritative) → MySQL read layer | `CATALOG_BACKEND` = `mysql` | MySQL (Prisma) for reads; Supabase still authoritative + dual-written | Read path + dual-write mirror in progress; Supabase remains the source of truth. |

### 1. Auth: Supabase Auth → NextAuth

- **What:** swaps the customer/admin/influencer auth backend (vendor portal EXCLUDED — stays on Supabase). NextAuth uses bcrypt credentials (hashes were **exported, never reset**), Google, and Facebook.
- **Server seam:** every route resolves identity through `lib/auth/routeUser.ts` — `getRouteAuth(req)` → `{ user, sb }` and `getRouteUser(req)`/`getRouteUserId(req)`. Admin gating goes through `lib/auth/adminGuard.ts` `requireAdmin(req)` (post-flip the role is read from the NextAuth JWT, set in `lib/auth/authOptions.ts`; pre-flip from `profiles.role` via the service-role client).
- **`auth.uid()` bridge:** Supabase RPCs/RLS that key off `auth.uid()` (cart, `create_order_from_cart`, reviews, addresses) have no Supabase session under NextAuth. They are bridged by service-role-only `<fn>_as(p_user_id, …)` wrapper RPCs (DB migration `nextauth_cart_order_as_user_wrappers`), reached via `lib/supabaseRoute.ts` `supabaseForUser(userId)` (service-role client under NextAuth) + `rpcForUser(sb, userId, fn, args)`.
- **Docs:** [migration/AUTH_FLIP_PLAN.md](migration/AUTH_FLIP_PLAN.md) (design) and [migration/STEP_E_RUNBOOK.md](migration/STEP_E_RUNBOOK.md) (the cutover runbook — flags, test matrix, rollback). Memory note: migrate by export/import, never force a reset.

### 2. Storage: Supabase Storage → AWS S3 + CloudFront

- **What:** serves `product-media` / `review-media` / `site-assets` from S3 (bucket `madenkorea-media`, ap-south-1) fronted by CloudFront. No DB rewrite — the S3 key is `<supabase-bucket>/<relative-path>`, so stored values resolve under either backend.
- **Resolver:** `lib/storage/backend.ts` `resolveMediaUrl(bucket, path)` (+ `STORAGE_BACKEND`) is the single normalizer/branch for read URLs. Server S3 ops live in `lib/storage/s3.ts`.
- **Uploads:** client uploads go through a presign broker — `app/api/uploads/presign` + `app/api/uploads/delete` (auth-gated) — driven by `lib/storage/upload-client.ts` `uploadMedia` / `deleteMedia` (presign→PUT under S3, session `.upload` under Supabase).
- **Docs:** [migration/S3_MIGRATION.md](migration/S3_MIGRATION.md) (infra, code, cutover env, follow-ups).

### 3. Database: Supabase Postgres → MySQL read layer (dual-write)

- **What:** Supabase Postgres stays authoritative; reads are progressively repointed to a MySQL (Prisma) mirror in `lib/data/*`, gated by `CATALOG_BACKEND=mysql`. Writes stay Supabase-first and are **mirrored** into MySQL so the storefront/account read surfaces don't go stale.
- **Mirror mechanism:** `lib/data/mirror.ts` `mirrorTableToMysql(table, scopeVal?)` is the generic column-/FK-safe re-sync (allowlist `MIRRORABLE`). Two front doors: server routes import it directly; **browser-direct CMS writes** keep their Supabase write then fire `lib/admin/mirror-mysql.ts` `mirrorMysql(table, scopeVal?)` → `POST /api/admin/mysql-mirror` (admin-gated) → `mirrorTableToMysql` (fire-and-forget).
- **Docs:** [migration/MYSQL_DUALWRITE_GAPS.md](migration/MYSQL_DUALWRITE_GAPS.md) (coverage, gaps, the audit) and [migration/MIGRATION_PLAN.md](migration/MIGRATION_PLAN.md) (slices + workstreams). One-time full refresh: `migration/etl/data-copy.mjs`.

## Tech Stack

- Framework: Next.js 14.2.35 with App Router.
- React: 18.2.
- TypeScript: 5.2.
- Styling: Tailwind CSS, shadcn/Radix UI, `lucide-react`.
- Backend: Supabase Auth, Postgres, Storage, Edge Functions, and RPCs.
- Payments: Razorpay.
- Shipping: DTDC/Shipsy APIs.
- Email: AWS SES.
- AI: OpenAI API for social copy.
- Social/marketing: Meta Graph API, Instagram, Facebook, WhatsApp Cloud API.
- Charts/carousels: Recharts, Embla, Swiper.

## Root Structure

- `app/`: Next.js pages, layouts, route handlers, server actions.
- `components/`: shared UI, customer shell, product cards, home modules, admin/vendor forms.
- `lib/`: Supabase clients, auth/cart contexts, pricing, membership, storage, DTDC, SES, social helpers.
- `utils/`: additional Supabase helper clients and vendor utilities.
- `types/`: shared TypeScript domain types.
- `supabase/migrations/`: local migrations present in this repo.
- `supabase/functions/`: deployed-edge-function source for referral clicks, Meta IG callback, SES webhook.
- `public/`: logos, static images, certifications, sample WhatsApp template JSON.

## Global App Shell

- `app/layout.tsx` wraps the app with `ThemeProvider`, `AuthProvider`, `CartProvider`, `WishlistProvider`, `Toaster`, and a floating WhatsApp button.
- Theme defaults to light through `next-themes` with `defaultTheme="light"`, `enableSystem={false}`, and app-specific `storageKey="madenkorea-theme"`. This avoids inheriting a stale generic `localStorage.theme` value from localhost or another project.
- Global scripts:
  - Google Analytics `G-PHZYP1091X`.
  - Razorpay checkout script loaded lazily.
- `middleware.ts` refreshes Supabase auth cookies for `/account`, `/admin`, `/checkout`, `/vendor`, and `/auth/callback`.

## Auth Model

Migration note: this describes the live default (Supabase Auth). A flag-gated NextAuth backend (`AUTH_BACKEND`/`NEXT_PUBLIC_AUTH_BACKEND=nextauth`) is code-complete but not flipped — see [Backend Migrations](#backend-migrations-flag-gated-in-progress). Server routes already resolve identity through the backend-aware seam (`lib/auth/routeUser.ts`, `lib/auth/adminGuard.ts`).

- Main client auth context: `lib/contexts/AuthContext.tsx`.
- Auth source: Supabase Auth plus `profiles` table.
- Recognized UI roles in `AuthContext`: `customer` and `admin`.
- Broader domain roles in `types/index.ts`: `admin`, `vendor`, `customer`, `guest`.
- Admin access in the admin dashboard depends on `profiles.role === "admin"`.
- Vendor access is handled separately by `components/vendor/VendorGate.tsx`, which calls Supabase RPC `get_my_vendor`.
- Password reset uses custom token storage:
  - `app/api/auth/forgot-password/route.ts`
  - `app/api/auth/reset-password/route.ts`
  - `supabase/migrations/20260421_create_password_reset_tokens.sql`

Important caveat: `lib/adminAuth.ts` checks an `ADMIN_EMAIL` header value, but the visible admin UI primarily uses `AuthContext` role checks.

## Customer Storefront

Primary pages:

- `/`: `app/page.tsx`. Home page with hero banners, trending products, featured products, product video carousel, brand carousel, influencer videos, certifications, and JSON-LD metadata.
- `/brands`: brand directory.
- `/brand/[slug]`: brand detail and products.
- `/c/[slug]`: category listing.
- `/products/[slug]` and `/product/[slug]`: product detail routes both exist.
- `/best-seller`: bestseller collection.
- `/shop-199`: special price collection.
- `/search`: search results.
- `/about`, `/contact`, `/privacy`, `/terms`, `/services`: static/support pages.
- `/legal/facebook-data-deletion`: Meta compliance page.

Key customer components:

- `components/CustomerLayout.tsx`: customer shell.
- `components/Header.tsx`: navigation, search, cart/account links.
- `components/Footer.tsx`: footer links and portal entry points.
- `components/SearchAutocomplete.tsx`: search suggestions.
- `components/ProductCard.tsx`: reusable product card.
- `components/home/*`: hero/banner/editorial/video/brand modules.
- `components/Cetifications.tsx`: certification carousel.

Home data sources:

- `app/_data/getBanners.ts`: reads `home_banners_live` and public `site-assets`.
- `app/_data/getBrands.ts`: reads `brands_live`.
- `app/_data/getInfluencerVideos.ts`: reads `home_influencer_videos_live`.
- `app/page.tsx`: reads `products` for featured and trending rails.

## Cart And Checkout

Cart state:

- `lib/contexts/CartContext.tsx` is the runtime cart source for UI.
- Guests use localStorage key `guest_cart_v1`.
- Authenticated users use Supabase RPCs through `lib/cartClient.ts`.
- Guest carts are merged into server carts on login with RPC `merge_cart`.

Cart APIs and RPCs:

- `ensure_cart`
- `add_to_cart`
- `update_cart_item`
- `remove_cart_item`
- `merge_cart`
- `cart_clear_for_user`
- `clear_my_cart`
- `/api/cart/add`
- `/api/cart/clear`

Checkout:

- `/cart`: cart UI.
- `/checkout`: checkout UI in `app/checkout/checkout.tsx`.
- `/api/checkout/calc-totals`: server-authoritative product pricing, sale pricing, stock, promo, influencer commission, and shipping math.
- `/api/orders/place`: older/order-placement endpoint that reuses `calc-totals`.
- `/api/razorpay/create`: creates a Razorpay order for an existing app order.
- `/api/razorpay/verify`: verifies signature, marks order paid, writes payment metadata/attribution, increments promo use, clears cart, and sends SES confirmation emails.
- `/order/success` and `/order/failure`: payment result pages.

Shipping math (India):

- `lib/membership.ts`
- K Plus members get free shipping.
- Non-members get free shipping above `DELIVERY_THRESHOLD` of `2000`.
- Default shipping fee is `149`.
- Package weight for DTDC consignments reads from `products.gross_weight_g` (with retail packaging), not `net_weight_g`.

Shipping math (international, slab pricing):

- `lib/internationalShipping.ts` — single source of truth.
- Per-country slab table: `country_shipping_rates` carries nine `slab_{500g,1kg,2kg,3kg,5kg,7kg,10kg,15kg,20kg}_inr` columns of un-buffered INR base costs (Korea Post EMS basis).
- Three global knobs on `store_settings`:
  - `intl_packaging_tare_pct` (default 15) — uplift applied to cart's gross weight before slab lookup. Covers outer/shipping packaging.
  - `intl_buffer_pct` (default 20) — markup over EMS base cost applied at runtime to derive the customer-facing fee.
  - `intl_max_shipping_weight_kg` (default 20) — hard cap (post-tare). Above this, checkout returns `SHIPPING_CAP_EXCEEDED` and cart/checkout block the Pay button with a "contact us" message.
- Computation flow: `grossG = Σ(gross_weight_g × qty)` → `effectiveG = grossG × (1 + tare%)` → bracket-up to nearest of 9 slabs → look up `base_inr` from the country row → customer fee = `base × (1 + buffer%)`. FX to buyer currency happens downstream in `razorpay/create`.
- Admin UI: `/admin/settings/international-shipping` — global settings card + per-country expandable card with all 9 slab inputs + ETA + notes + active toggle.
- Product weight: `products.gross_weight_g` drives this (and DTDC). `products.net_weight_g` stays as informational/labelling metadata only.

Promo and influencer attribution:

- Promo code cookie helpers live in `lib/promo-cookie.ts`.
- `/api/promo/apply` validates via RPC `get_promo_details` and stores the promo cookie.
- `/api/promo/clear` clears the promo cookie.
- `calc-totals` enforces a **per-influencer** commission cap stored on `influencer_profiles.commission_cap_pct` (whole percent, 5–100, admin-managed from `/admin/influencers`). The previous global 25% constant has been removed.
- `influencer_profiles.default_user_discount_pct` (whole percent, 0..cap) is the admin-set default customer share — used by the dashboard's "Recommended" button.
- **Deferred wiring:** the per-product `influence_caps` table still exists in the schema but is NOT consulted by `calc-totals` right now (decision: 2026-05-19, per-product caps will be re-wired later). When re-wired, the effective cap should become `min(influencer.commission_cap_pct, influence_caps.cap_percent)` so the influencer ceiling can never be bypassed by a permissive product row.

## K Plus Membership

- Page: `/k-plus`.
- Library: `lib/membership.ts`.
- Plan code: `k_plus`.
- Price: `199`.
- Duration: 90 days.
- APIs:
  - `/api/membership/create-order`
  - `/api/membership/verify`
  - `/api/membership/sync-status`
- Data table: `user_memberships`.
- Payment provider: Razorpay.

## Account Area

Pages:

- `/account`: dashboard.
- `/account/orders`: order history.
- `/account/orders/[orderId]`: order detail including DTDC shipment and payment lookup.
- `/account/orders/[orderId]/invoice`: invoice view.
- `/account/settings`: profile and address management.
- `/account/wishlist`: wishlist management.

Tables commonly used:

- `profiles`
- `addresses`
- `orders`
- `order_items`
- `payments`
- `dtdc_shipments`
- `wishlist_items`
- `products`

## Admin Portal

Admin root:

- `/admin`: role-gated dashboard with links to products, orders, vendors, CMS, influencers, analytics, invoices, WhatsApp, and social marketing.

Main admin areas:

- `/admin/products`: product catalog.
- `/admin/products/new`: new product.
- `/admin/products/[id]`: product edit via `AdminProductEditor`.
- `/admin/orders`: order list and fulfillment controls.
- `/admin/orders/[id]`: order detail with DTDC shipment actions.
- `/admin/vendors`: vendor list.
- `/admin/vendors/[id]`: vendor profile and approval/management.
- `/admin/influencers`: influencer requests, profiles, payouts.
- `/admin/analytics`: legacy analytics dashboard with mock recharts data.
- `/admin/analytics/funnel`: live conversion funnel built on the `events` table — see [ANALYTICS.md](ANALYTICS.md).
- `/admin/analytics/sessions`: list of recent sessions sorted by abandoned-checkout first.
- `/admin/analytics/sessions/[id]`: per-session event timeline with delta times and props.
- `/admin/settings`: store settings surface (Shipping tab is wired to `store_settings`; other tabs still localStorage-only).

CMS:

- `/admin/cms`: CMS hub.
- `/admin/cms/banners`: home banners and media upload to `site-assets`.
- `/admin/cms/brands`: brand CRUD.
- `/admin/cms/categories`: category CRUD.
- `/admin/cms/coupons`: coupon/promo management.
- `/admin/cms/media`: media library.
- `/admin/cms/pages`: static page editor.
- `/admin/cms/product-video`: homepage product video carousel management.
- `/admin/cms/influencer-video`: influencer video carousel management.

Invoices:

- `/admin/invoices`
- `/admin/invoices/new`
- `/admin/invoices/[id]`
- `/admin/invoices/[id]/edit`
- Tables: `invoices`, `invoice_items`, `invoice_companies`.

Email marketing:

- Some admin email route files under `app/admin/email` currently have `.txt` extensions, so they are not active Next.js pages.
- APIs under `/api/admin/email/*` are active route handlers for contacts, categories, campaign summaries, sending, templates, unsubscribes, and upload import.
- SES helper: `lib/ses.ts`.
- Tables: `email_contact`, `email_category`, `email_contact_category`, `email_campaign`, `email_campaign_category`, `email_campaign_recipient`, `email_unsubscribe`.

WhatsApp marketing:

- `/admin/whatsapp`
- `/admin/whatsapp/campaigns`
- `/admin/whatsapp/campaigns/new`
- `/admin/whatsapp/campaigns/[id]`
- `/admin/whatsapp/contacts`
- `/admin/whatsapp/templates`
- API: `/api/whatsapp/send-campaign/[campaignId]`.
- Helper: `lib/whatsappMeta.ts`.
- Tables: `whatsapp_campaigns`, `whatsapp_campaign_messages`, `whatsapp_contacts`, `whatsapp_templates`.

Social marketing:

- `/admin/marketing/multichannel`
- `/admin/marketing/instagram`
- `/admin/marketing/facebook`
- Legacy/direct Instagram admin pages also exist under `/admin/instagram/*`.
- APIs exist under `/api/instagram/*`, `/api/facebook/*`, `/api/social/*`, and `/api/uploads/social`.
- AI copy helpers:
  - `/api/ai/social-copy`
  - `/api/ai/facebook-copy`

## Vendor Portal

Public vendor routes:

- `/vendor/login`
- `/vendor/register`

Protected vendor routes:

- `/vendor`: dashboard.
- `/vendor/products`: product list.
- `/vendor/products/new`: product creation.
- `/vendor/products/single-new`: alternate/single-product creation flow.
- `/vendor/products/[id]`: edit product.
- `/vendor/orders`: vendor orders.
- `/vendor/orders/[id]`: order fulfillment detail.
- `/vendor/payouts`: payout statements.
- `/vendor/alerts`: low stock alerts.

Gate:

- `components/vendor/VendorGate.tsx` protects vendor routes.
- It uses Supabase Auth session plus RPC `get_my_vendor`.
- Approved vendors render children; pending/rejected/disabled vendors see status screens.

Likely tables:

- `vendors`
- `products`
- `orders`
- `order_items`
- `influencer_payouts` or payout-related tables depending on page context.

## Influencer And Referral System

Public/application routes:

- `/influencer-request`
- `/r/[code]`: referral/promo redirect or attribution route.
- `/rl/[id]`: referral link landing route.

Influencer dashboard:

- `/influencer` — single source of truth for creating + listing promos (replaces the retired `/influencer/promos`).
- `/influencer/links`
- `/influencer/payouts`
- `/influencer/promos` — permanent server-side redirect to `/influencer`; kept only for stale bookmarks.

APIs:

- `/api/influencer/apply`
- `/api/influencer/request`
- `/api/influencer/status`
- `/api/influencer/links`
- `/api/influencer/promos`
- `/api/influencer/promos/[id]`
- `/api/me/summary`
- `/api/me/activity`
- `/api/me/wallet`
- `/api/me/promos`
- `/api/me/payouts`
- `/api/me/payouts/request`
- `/api/me/request`

RPCs:

- `request_influencer`
- `get_referral_context`
- `log_referral_click`
- `get_my_wallet_meta`
- `save_my_wallet_meta`
- `influencer_available_to_withdraw`
- `influencer_timeseries`

Tables:

- `influencer_requests`
- `influencer_profiles`
- `referral_links`
- `referral_clicks`
- `promo_codes`
- `influence_caps`
- `order_attributions`
- `order_attribution_items`
- `influencer_payouts`

Edge function:

- `supabase/functions/log-referral-click/index.ts`.

## Shipping And DTDC

Library:

- `lib/dtdc/env.ts`: required env validation.
- `lib/dtdc/shipsy.ts`: create/cancel/label integration.
- `lib/dtdc/tracking.ts`: tracking auth/details.
- `lib/dtdc/createShipmentForOrder.ts`: creates shipment from order data.
- `lib/dtdc/buildConsignmentRequest.ts`: builds DTDC consignment request.

APIs:

- `/api/dtdc/create`
- `/api/dtdc/label`
- `/api/dtdc/cancel`
- `/api/dtdc/track`

Tables:

- `dtdc_shipments`
- `dtdc_shipment_events`
- `dtdc_tracking_tokens`
- `dtdc_api_logs`

Note: auto-create shipment after payment is present but commented out in `app/api/razorpay/verify/route.ts`.

## Analytics / Conversion Funnel

First-party event log on Supabase. Full reference in [ANALYTICS.md](ANALYTICS.md).

Code:

- `lib/analytics/events.ts`: event-name whitelist (`KNOWN_EVENTS`) and funnel stage definitions.
- `lib/analytics/track.ts`: client `trackEvent()` with batching + sendBeacon flush on tab close.
- `lib/analytics/identity.ts`: `mik_anon_id` / `mik_session_id` cookie helpers (server).
- `lib/analytics/ip.ts`: IP truncation (/24 v4, /48 v6) + UA → device parser.
- `components/AnalyticsBootstrap.tsx`: mounted in root layout; emits `page_view` on every route change.

APIs:

- `POST /api/events/track`: ingest endpoint. Strips PII, drops unknown event names, honors `profiles.tracking_consent`.
- `GET /api/admin/analytics/funnel?range={1d|7d|30d|90d}`: per-session funnel pivot.
- `GET /api/admin/analytics/sessions?range&filter={abandoned|purchased|failed|all}`: session summaries with name/email lookup for logged-in users.
- `GET /api/admin/analytics/sessions/[id]`: per-session event timeline with product-name resolution.

Tables:

- `events` — append-only event log (admin-read RLS, service-role write only).
- `profiles.tracking_consent` — per-user opt-out flag (default true).

## Supabase Clients

Migration note: under the flag-gated auth/DB migrations, route handlers should resolve the user via the backend-aware seam (`lib/auth/routeUser.ts`) and use `lib/supabaseRoute.ts` `supabaseForUser(userId)` / `rpcForUser(...)` for `auth.uid()`-based RPCs, not a raw `supabaseRouteClient()`. MySQL reads go through `lib/data/*`. See [Backend Migrations](#backend-migrations-flag-gated-in-progress).

There are several helper clients. Prefer using the helper that matches the execution context.

- `lib/supabaseClient.ts`: browser/client singleton using anon key.
- `lib/supabaseAdmin.ts`: server admin/service-role client.
- `lib/supabaseRoute.ts`: route handler client.
- `lib/supabaseServer.ts`: service/server helper used by auth and email flows.
- `lib/supabase-rsc.ts`: server component helper.
- `lib/supabase-browser.ts`: browser helper.
- `utils/supabase/client.ts`, `server.ts`, `browser.ts`, `middleware.ts`: additional Supabase SSR helpers.

Important: service-role clients must stay server-only. Do not import `lib/supabaseAdmin.ts` into client components.

## Database Tables Referenced

Tables and storage buckets/views observed in the code:

- `addresses`
- `brands`, `brands_live`
- `campaign_posts`, `campaigns`
- `cart_items`, `cart_lines`, `carts`
- `categories`
- `contact_messages`
- `dtdc_api_logs`, `dtdc_shipment_events`, `dtdc_shipments`, `dtdc_tracking_tokens`
- `email_campaign`, `email_campaign_category`, `email_campaign_recipient`, `email_category`, `email_contact`, `email_contact_category`, `email_unsubscribe`
- `facebook_page_comments`, `facebook_page_posts`
- `home_banners`, `home_banners_live`
- `home_influencer_videos`, `home_influencer_videos_live`
- `home_product_videos`
- `influence_caps`
- `influencer_payouts`, `influencer_profiles`, `influencer_requests`
- `instagram_accounts`, `instagram_comments`, `instagram_conversations`, `instagram_media_posts`, `instagram_messages`
- `invoice_companies`, `invoice_items`, `invoices`
- `order_attribution_items`, `order_attributions`, `order_items`, `orders`
- `password_reset_tokens`
- `payment_orders`, `payments`
- `product_images`, `product_review_stats`, `product_reviews`, `products`
- `profiles`
- `promo_codes`
- `referral_clicks`, `referral_links`
- `review_votes`
- `social_scheduled_posts`, `social_schedules`
- `user_memberships`
- `vendors`
- `whatsapp_campaign_messages`, `whatsapp_campaigns`, `whatsapp_contacts`, `whatsapp_templates`
- Storage buckets: `product-media`, `review-media`, `site-assets`

Migration note: media URLs/uploads for these buckets are flag-gated — a Supabase Storage → AWS S3/CloudFront backend (`NEXT_PUBLIC_STORAGE_BACKEND=s3`) is code-complete but not flipped. Resolve read URLs via `lib/storage/backend.ts` `resolveMediaUrl` and upload via `lib/storage/upload-client.ts` rather than calling Supabase Storage directly. See [Backend Migrations](#backend-migrations-flag-gated-in-progress).

RPCs observed:

- `attribute_order`
- `cart_clear_for_user`
- `clear_my_cart`
- `get_my_vendor`
- `get_my_wallet_meta`
- `get_promo_details`
- `get_referral_context`
- `increment_promo_use`
- `influencer_available_to_withdraw`
- `influencer_timeseries`
- `is_admin`
- `log_referral_click`
- `rebase_default_address`
- `request_influencer`
- `save_my_wallet_meta`
- `validate_promo`

## Local Migrations Present

- `20260421_create_password_reset_tokens.sql`
- `20260422_create_contact_messages.sql`
- `20260422_enforce_promo_max_uses.sql`

The code references many more tables/RPCs than these migrations define, so the production Supabase project contains schema that is not fully represented in this repository.

## Environment Variables Referenced

Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL`

App/site:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`
- `APP_URL`
- `NEXT_PUBLIC_SUPPORT_PHONE`
- `NEXT_PUBLIC_SUPPORT_ADDRESS`
- `ADMIN_EMAIL`
- `NODE_ENV`
- `VERCEL`
- `VERCEL_ENV`

Razorpay:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`

Email/SES:

- `AWS_SES_REGION`
- `AWS_REGION`
- `SES_REGION`
- `SES_ACCESS_KEY_ID`
- `SES_SECRET_ACCESS_KEY`
- `AWS_FROM_EMAIL`
- `MAIL_FROM`
- `CONTACT_NOTIFY_EMAIL`

DTDC:

- `DTDC_TRACK_ENV`
- `DTDC_SHIPSY_BASE_URL`
- `DTDC_SHIPSY_API_KEY`
- `DTDC_CUSTOMER_CODE`
- `DTDC_DEFAULT_SERVICE_TYPE_ID`
- `DTDC_DEFAULT_COMMODITY_ID`
- `DTDC_DEFAULT_LOAD_TYPE`
- `DTDC_LABEL_CODE_4X6`
- `DTDC_LABEL_CODE_A4`
- `DTDC_TRACK_AUTH_URL`
- `DTDC_TRACK_DETAILS_URL`
- `DTDC_TRACK_USERNAME`
- `DTDC_TRACK_PASSWORD`
- `DTDC_TRACK_TOKEN_MAX_AGE_MINUTES`
- `DTDC_PICKUP_NAME`
- `DTDC_PICKUP_PHONE`
- `DTDC_PICKUP_ADDRESS_LINE1`
- `DTDC_PICKUP_ADDRESS_LINE2`
- `DTDC_PICKUP_CITY`
- `DTDC_PICKUP_STATE`
- `DTDC_PICKUP_PINCODE`
- `DTDC_DEFAULT_LENGTH_CM`
- `DTDC_DEFAULT_WIDTH_CM`
- `DTDC_DEFAULT_HEIGHT_CM`

Meta/social:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_IG_APP_ID`
- `META_IG_APP_SECRET`
- `META_IG_REDIRECT_URI`
- `META_IG_GRAPH_API_BASE`
- `META_IG_GRAPH_API_VERSION`
- `INSTAGRAM_OWNER_ID`
- `IG_OWNER_ID`
- `IG_BUSINESS_ACCOUNT_ID`
- `IG_ACCESS_TOKEN`
- `NEXT_PUBLIC_IG_BUSINESS_ACCOUNT_ID`
- `NEXT_PUBLIC_IG_ACCESS_TOKEN`
- `FB_OWNER_ID`

WhatsApp:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_API_VERSION`
- `NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER`
- `NEXT_PUBLIC_WHATSAPP_DEFAULT_MESSAGE`

AI:

- `OPENAI_API_KEY`

Referral:

- `REF_ATTRIBUTION_DAYS`

## Issue Register

- `ISSUE_REGISTER.md` contains the enriched application issue register from the earlier audit: critical, moderate, minor, production-readiness, and compliance gaps.
- Treat the issue register as a planning document. Re-verify each issue before implementation, especially items marked `[INFERRED]` or `[UNVERIFIED]`.
- When fixing an issue, update both the issue register status and any relevant implementation notes in this file.
- 2026-04-24 quick-fix batch: fixed cart product links to use `/products/[slug]`, changed brand placeholder fallbacks to `/placeholder.png`, corrected vendor support email to `support@madenkorea.com`, added review-delete confirmation, and added Support links to desktop/mobile header navigation.
- 2026-04-24 quick-fix batch 2: checkout contact/shipping inputs now include browser autofill hints and HTML phone/pincode validation. Verified existing fixes for login password toggle, cart totals loading state, review submit in-flight state, neutral review title placeholder, and absence of live home mock-data imports.
- 2026-04-24 quick-fix batch 3: cart clear API now catches the optional `clear_my_cart` RPC normally and falls back to table deletes without typed `.catch()` errors. Verified existing fixes for vendor forgot-password link, registration email-verification handling, review admin role lookup, cart unavailable-item handling, and product-detail Add to Cart in-flight/error states.

## Dead Code Review Queue

Scanned on 2026-04-24. Nothing in this section has been deleted yet. Review these files before removal, then update this section after cleanup.

High-confidence deletion candidates:

- `components/admin/ProductForm v-1.tsx` - stale product form backup; not imported and currently contributes typecheck errors.
- `components/admin/ProductForm v-2.tsx` - stale product form backup; not imported and currently contributes typecheck errors.
- `app/product/[slug]/product.tsx` - unused legacy product detail component; `app/product/[slug]/page.tsx` redirects to `/products/[slug]`.
- `app/(checkout)/actions/applyPromo.ts` - unused checkout server action; current checkout uses API routes/hooks instead.
- `app/(checkout)/actions/calcTotals.ts` - unused checkout server action; current checkout uses `/api/checkout/calc-totals`.
- `app/(checkout)/actions/checkout.ts` - unused checkout server action; current checkout uses Razorpay API flow.
- `app/auth/register/action.ts` - unused legacy register action; current register page imports `./register`.
- `components/KPlusPromoBanner.tsx` - only referenced by commented-out code in `app/page.tsx`.
- `components/home/HeroVideo.tsx` - no live imports found.
- `app/admin/email/contacts/page.txt` - `.txt` archive, not an App Router page.
- `app/admin/email/dashboard/page.txt` - `.txt` archive, not an App Router page.
- `app/admin/email/layout.txt` - `.txt` archive, not an App Router layout.
- `app/admin/email/page.txt` - `.txt` archive, not an App Router page.
- `public/placeholder.png` - no source references found.

Likely dead, but confirm whether old mock/demo layers are still useful before deleting:

- `lib/api/MockAuthApi.ts`
- `lib/api/MockProductApi.ts`
- `lib/adapters/AuthAdapter.ts`
- `lib/adapters/ProductAdapter.ts`
- `lib/hooks/useCartTotals.ts`
- `types/cart.ts`
- `lib/banners.ts`
- `lib/supabase-browser.ts`
- `lib/adminAuth.ts`
- `lib/addressClient.ts`
- `utils/getVendor.ts`
- `utils/supabase/browser.ts`
- `utils/supabase/client.ts`
- `utils/supabase/middleware.ts`

Keep for now despite low or indirect import visibility:

- `components/ui/*` unused shadcn components - reusable design-system inventory; remove only during an intentional UI dependency cleanup.
- `types/razorpay.d.ts` - global declaration for Razorpay integration.
- `supabase/functions/*` - Supabase Edge Function entry points outside the Next.js import graph.
- `supabase/migrations/*` - historical database migrations.

Potential package cleanup candidates after code review:

- `jwt-decode`
- `msw`
- `zod`
- `@hookform/resolvers`

## Important Implementation Notes

- Several client components create Supabase clients directly with env vars instead of importing one shared browser helper. This is functional but inconsistent.
- The older docs say mock APIs/localStorage are the main data layer, but current code heavily uses Supabase. Treat mock files under `lib/mock-data` as legacy/demo data unless the target file imports them.
- Product routes exist in both singular and plural forms: `/product/[slug]` and `/products/[slug]`.
- Admin email UI files with `.txt` extensions are not active App Router pages.
- `rg process.env` did not return results in this shell, but PowerShell `Select-String` confirmed the env variables above.
- Avoid reading or pasting `.env` values into docs or commits.
- Route handlers using service-role keys must stay server-side.
- Payment verification sends large inline HTML emails from `app/api/razorpay/verify/route.ts`; future edits there should be careful because it combines payment, attribution, cart clearing, and email side effects.

## Useful Commands

- Install dependencies: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`

## Future Work Pointers

- If changing checkout, inspect `app/checkout/checkout.tsx`, `lib/hooks/useRazorpayCheckout.ts`, `/api/checkout/calc-totals`, `/api/razorpay/create`, and `/api/razorpay/verify` together.
- If changing promo/referral behavior, inspect `lib/promo-cookie.ts`, `/api/promo/*`, `/api/checkout/calc-totals`, `/r/[code]`, `/rl/[id]`, and the influencer APIs.
- If changing auth, inspect `AuthContext`, middleware, `/auth/*`, `/api/auth/*`, `profiles`, and vendor-specific `VendorGate`.
- If changing admin products, inspect `app/admin/products/*`, `components/admin/ProductForm.tsx`, `components/admin/ProductEditor.tsx`, and `product_images`.
- If changing social tools, inspect `/admin/marketing/*`, `/admin/instagram/*`, `/api/instagram/*`, `/api/facebook/*`, `/api/social/*`, and the OpenAI routes.
- If changing shipment flow, inspect `lib/dtdc/*`, `/api/dtdc/*`, admin order detail, and account order detail.
