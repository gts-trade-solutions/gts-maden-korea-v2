# MadeNKorea — Supabase → MySQL Migration Plan

Companion to [DB_INVENTORY.md](DB_INVENTORY.md) (the authoritative live-DB inventory).
Last updated 2026-06-16.

## Target architecture (locked)

| Concern | From (Supabase) | To |
|---|---|---|
| Database | Postgres 17 (cloud) | **MySQL 8.0.36** (local `MySQL80` service) |
| Data access | PostgREST `.from()` from browser + RPCs | **Next.js API routes + typed data-access layer (Prisma, introspected)** |
| Auth | Supabase Auth (GoTrue) | **NextAuth / Auth.js** — Google OAuth + Facebook OAuth + email/password credentials, DB sessions |
| Authorization | RLS policies (~230) | **App-layer checks in each API route** (per-route ownership/role guards) |
| Storage | Supabase Storage buckets | **AWS S3** (`product-media`, `review-media`, `site-assets` → S3 prefixes) |
| Stored procedures | ~80 plpgsql/sql RPCs | **TypeScript service functions** in transactions (`SELECT … FOR UPDATE`) |
| Triggers (~60) | DB triggers | `updated_at` → MySQL `ON UPDATE`; the rest → service-layer logic |
| Search | `tsvector` + `pg_trgm` | **MySQL `FULLTEXT`** (quality differs; external engine optional later) |

> ⚠️ Two apps share this database (storefront + vendor/inventory portal), both
> connected directly. Both must move to the same MySQL together, or inventory/orders
> go split-brain. The vendor portal is a separate codebase = separate work item.

## Postgres→MySQL type rulebook

See the header of [mysql/01_core_catalog.sql](mysql/01_core_catalog.sql) — that file is the
worked reference. Same rules apply to every slice.

## Cutover order (slices) — low risk → high risk

Schema + data + API/backend are migrated together per slice, behind a `DATA_BACKEND` flag.

| # | Slice | Tables (core) | Status |
|---|---|---|---|
| 01 | Core catalog | brands, categories, products, product_images | ✅ DDL loaded + verified in MySQL; Prisma models introspected |
| 02 | Catalog extras | product_videos, product_story_blocks, product_country_prices, currency_rates, store_settings | ⬜ |
| 03 | Reviews | product_reviews, review_votes (+ stats views) | ⬜ |
| 04 | Home/CMS | home_banners, home_*_videos, *_video_products, k_partnership_videos, *_translations | ⬜ |
| 05 | Auth + profiles | users (new), profiles, sessions, accounts, password_reset_tokens, email_verification_tokens | ⬜ |
| 06 | Account | addresses, wishlist_items | ⬜ |
| 07 | Cart | carts, cart_items (+ ensure/add/update/remove/merge/recalc logic) | ⬜ |
| 08 | Orders + checkout | orders, order_items, payments, payment_orders (+ calc-totals, mark_order_paid) | ⬜ |
| 09 | Promo/referral/influencer | promo_codes, referral_*, influencer_*, order_attributions, influence_caps | ⬜ |
| 10 | Membership | user_memberships, membership_plans | ⬜ |
| 11 | Shipping/DTDC | dtdc_*, shipping_zones, pincodes, country_shipping_rates | ⬜ |
| 12 | International/i18n | international_orders, country_contacts, translations | ⬜ |
| 13 | Vendor + inventory ERP | vendors, vendor_members, inventory_units, batches, customers | ⬜ |
| 14 | Invoicing | invoices, invoice_*, batches | ⬜ |
| 15 | Email/WhatsApp/social | email_*, whatsapp_*, instagram_*, facebook_*, campaigns | ⬜ |
| 16 | Analytics/notifications | events, admin_notifications, notification_recipients, contact_messages | ⬜ |

## Workstreams running alongside the slices

- **A. MySQL DDL** — translate all 106 tables (`migration/mysql/NN_*.sql`).
- **B. Data ETL** — Postgres → MySQL row copy with type coercion; verify row counts + checksums.
- **C. Data-access layer** — Prisma introspects the MySQL schema; repositories per domain.
- **D. Auth** — NextAuth (Google/Facebook/credentials); migrate `auth.users` → `users` (bcrypt hashes are portable).
- **E. Storage** — S3 client + signed-URL helper (keep public-URL helper signatures stable); copy bucket objects to S3.
- **F. RPC reimplementation** — port the ~80 business-logic functions to TS services.
- **G. API routes** — move the 79 browser-side `.from()` callers onto server routes.

## Progress log

- 2026-06-16 — Pulled full live inventory via MCP (106 tables / 124 fns / 9 views / ~60 triggers / 14 enums).
- 2026-06-16 — Confirmed local MySQL 8.0.36 running. Drafted slice 01 DDL + translation rulebook.
- 2026-06-16 — Created `madenkorea` DB; loaded slice 01 (4 tables) clean; verified (60 cols / 5 FKs / FULLTEXT).
- 2026-06-16 — Installed Prisma 6.19.3; `db pull` introspected 4 models; client generated. Initial setup complete.
- 2026-06-16 — Built automated ETL pipeline (`migration/etl/`): `schema-gen.mjs` (PG→MySQL DDL for all tables),
  `data-copy.mjs` (row copy + count verify), `.env`, README. Installed `pg` + `mysql2`.
- 2026-06-16 — ✅ **DATABASE MIGRATION COMPLETE.** Generated + loaded all **104 tables** (90 FKs) into MySQL;
  copied **all data** (every table's PG→MySQL row count matches: products 183, reviews 5633, pincodes 19238,
  events 14007, inventory_units 3869, etc.). Prisma introspected all 104 models + client generated.
  Translation edge-cases handled in the generator: TEXT/JSON literal defaults, array defaults, `CURRENT_DATE`,
  `auth.uid()` defaults dropped, partial-unique indexes demoted to plain indexes, case-proof column lookup.

## ✅ Workstream status
- **A. MySQL DDL** — DONE (auto-generated, all 104 tables).
- **B. Data ETL** — DONE (all rows copied + verified).
- **C. Prisma data layer** — DONE (client + singleton `lib/db/prisma.ts`, serializer `lib/db/serialize.ts`).
- **G. API routes** — STARTED: catalog read path live (`lib/data/catalog.ts` + `/api/catalog/products`,
  `/api/catalog/products/[slug]`, `/api/catalog/brands`) — verified serving real MySQL data with correct types.
- **D. Auth (NextAuth)** — 🟡 FOUNDATION DONE: `auth_users/auth_accounts/auth_sessions/
  auth_verification_tokens` tables (`migration/mysql/auth_schema.sql`); migrated **53 users / 15 bcrypt
  hashes / 43 OAuth accounts** (`migration/etl/auth-migrate.mjs`, no reset); Prisma models (User/Account/
  Session/VerificationToken, hand-mapped); NextAuth v4 configured (`lib/auth/authOptions.ts` + route) with
  Credentials(bcrypt) + Google + Facebook + JWT sessions + Prisma adapter. Verified: credentials authorize
  (correct→true / wrong→false) + OAuth account linkage. NOT YET WIRED into the app (next: AuthContext,
  middleware, login/register, the 261 `supabase.auth.*` calls). OAuth needs Google/FB client id+secret env.
- **E–F (Storage / RPCs)** — NOT STARTED.

## Phase A — Transactional half → MySQL (Supabase session = identity until the flip)
Identity seam: `lib/auth/identity.ts` → `getCurrentUserId()` reads the Supabase session now;
set `AUTH_BACKEND=nextauth` at the flip to switch it to NextAuth (one config change, no route edits).
- ✅ **Identity seam** built.
- 🟡 **Account** — read pages migrated to MySQL (flag + Supabase fallback, identity from seam):
  - orders list (`/api/account/orders`), order detail (`/api/account/orders/[orderId]` — orders/items/
    shipment/payment, ownership-checked), dashboard (name from AuthContext; recently-viewed via new
    `/api/catalog/products/by-ids`). Pages repointed; all verified (401 unauth / page 200 / data OK).
  - `/account/wishlist` = redirect to `/wishlist` (no migration).
  - ✅ settings/addresses — **dual-write** pattern: profile (`/api/account/profile`) + addresses
    (`/api/account/addresses` + `/[id]` for update/delete/set-default). Writes go to **Supabase first
    (keeps checkout working) then MySQL best-effort**; reads from MySQL (flag). Password change/reauth
    stays on Supabase until the auth flip. Verified (401 guards, page 200, no errors).
- **Dual-write decision (2026-06-16):** transactional WRITES go to both DBs during transition so nothing
  diverges/breaks; each domain's Supabase write is dropped once its consumers are on MySQL.
  **Supabase removal = Phase E**, only after ALL reads+writes on MySQL + auth on NextAuth + storage on S3
  + edge functions migrated.
- ✅ **Cart** — service ported (`lib/data/cart.ts`: effective price, line totals, K-Plus-aware recalc,
  full CRUD + mirror). Routes: `/api/cart/state` (read MySQL/flag) + `/api/cart/mutate` (Supabase RPC
  authoritative → **mirror into MySQL**, so item ids + totals match exactly and checkout stays in sync).
  `lib/cartClient.ts` repointed to the routes (CartContext unchanged; no direct Supabase). Verified
  (guards, cart page 200, math exact). Service functions become authoritative at Phase E (Supabase drop).
- ✅ **Reviews** — full PDP review system on MySQL behind the flag:
  - Reads: `lib/data/reviews.ts` (two-bucket country-first pagination, countries, count) → `/api/catalog/reviews`;
    user helpful-votes → `/api/reviews/votes`. Verified (8/page, 11 countries, 135 count).
  - Writes (dual-write, Supabase-first + MySQL): edit/delete/admin-status `/api/reviews/[id]`,
    helpful vote `/api/reviews/[id]/vote` (recomputes `helpful_count` like sync_helpful_count trigger),
    create `/api/reviews/create` (same id). `product.tsx` review effect + all actions repointed.
  - PDP is now fully on MySQL (server render + related-products + reviews client widgets).
- 🟡 **Checkout + payments** — test-first underway:
  - ✅ Parity test PASSED: live Supabase `calc-totals` vs MySQL prototype agree to the rupee
    (subtotal/shipping/discount/total) — the money math ports correctly.
  - ✅ `getShippingConfig` (store_settings) migrated to MySQL (flag-aware) — feeds calc-totals + cart recalc.
  - ✅ calc-totals route reads on MySQL (flag): products, country offers, promo (`getPromoDetailsMysql`
    mirrors get_promo_details), influencer cap + region, membership, shipping config (`lib/data/checkout.ts`).
    Verified: route returns subtotal/shipping/discount/total = 4516, matching the Supabase parity test.
    (Intl shipping rate helpers `getCountryShippingRate`/`getIntlShippingSettings` still read Supabase in
    mysql mode — non-IN path only; migrate with the international slice.)
  - ✅ Order creation — `/api/orders/create` = Supabase `create_order_from_cart` (authoritative) → mirror
    order+items into MySQL (`lib/data/orders.ts` `mirrorOrderIntoMysql`); `useRazorpayCheckout` repointed
    (no more browser→Supabase rpc). Route guards (401) + /checkout compile verified.
  - ✅ Reprice-at-order-creation fix (`lib/data/orders.ts` `repriceCartToLive`) — `create_order_from_cart`
    snapshots `cart_items.line_total` verbatim, so a price change after add-to-cart made the order (and the
    Razorpay charge, which reads the order row) DIFFER from the calc-totals total shown on checkout. Found
    via real test: Razorpay charged ₹3,597 vs page ₹3,448 (combo sale_price 1299→1249, sun block 999→950)
    — a customer OVERCHARGE. Route now reprices `cart_items.unit_price/line_total` to current effective price
    (same `effectivePriceForCountry` resolver calc-totals uses) before the RPC. Validated:
    `migration/etl/test-reprice.mjs` proves reprice subtotal === live calc-totals subtotal. Pre-existing live
    bug (NOT migration-caused — MySQL prices == Supabase). NOTE: shared RPC still has the latent bug for any
    DIRECT caller (vendor app / legacy path); promo + price-change combo not separately handled.
    ✅ VERIFIED via real browser checkout: Razorpay amount == checkout page total; success + failure paths work.
  - ✅ Payment-path dual-write (success) — `razorpay/verify` does all writes to Supabase only; closed the hole
    so MySQL stays in sync. After the paid-order update: re-mirror the order into MySQL via
    `mirrorOrderIntoMysql(admin, order.id)` (copies status=paid, paid_at, payment_provider/reference/meta,
    final totals). After `cart_clear_for_user`: `clearCartMysql(userId)` (`lib/data/cart.ts`) empties the MySQL
    cart + zeros totals so the storefront badge/cart page clear on payment. Both best-effort (try/catch, dbg
    breadcrumbs), never fail the payment. Routes compile (verify 400 smoke, calc-totals 200); changed files
    typecheck clean. NOTE: `razorpay/create`'s intl order-update (currency/fx/totals) not separately mirrored —
    the verify mirror captures final state; pending_payment intl window is the only gap (IN unaffected).
    Still Supabase-only (mirror when those reader surfaces migrate): `order_attributions`, `payments`,
    `payment_orders`, `increment_promo_use`. ⚠️ `mark_order_paid` (Supabase) fires
    `trg_order_stock_sync → allocate_order_units` writing `inventory_units` (VENDOR/ERP domain) — NOT mirrored;
    cross-app coordination still needed before that table moves.
    ⏳ END-TO-END VERIFICATION PENDING: one real successful checkout → confirm MySQL order shows status=paid +
    paid_at + payment_reference, and the MySQL cart is empty. (Not curl-testable — needs valid Razorpay sig.)
- 🔶 Membership (K-Plus):
  - ✅ READ already on MySQL — `getActiveMembershipMysql` (calc-totals) + `recalcCartTotalsMysql` grant free
    shipping from MySQL `user_memberships`.
  - ✅ WRITE dual-write (`lib/data/membership.ts` `mirrorMembershipsIntoMysql`) — `/api/membership/verify`
    (purchase insert) and `/api/membership/sync-status` (active→expired flip) were Supabase-only, so a fresh
    K-Plus buyer would still be charged shipping on the MySQL path. Both now re-mirror the user's memberships
    into MySQL after the Supabase write. Best-effort; routes compile (400/401) + typecheck clean.
    ⏳ VERIFY via a real K-Plus purchase → MySQL `user_memberships` has the active row + free shipping applies.
  - ⬜ Display reads still Supabase: `lib/membership.ts` client `getActiveMembership` (K-Plus/account status
    pill) reads Supabase directly — display-only (authoritative shipping math already MySQL); migrate later.
- 🔶 Influencer:
  - ✅ WRITE-mirror at `razorpay/verify` (`lib/data/attribution.ts`) — `mirrorOrderAttributionIntoMysql`
    (after the order mirror, so the FK target exists) + `mirrorPromoUsesIntoMysql` (after `increment_promo_use`,
    re-reads `uses`+`active`). Best-effort; verify compiles + typecheck clean. So the commission ledger now
    syncs to MySQL on each paid promo order.
  - ✅ READ: `/api/me/summary` → MySQL behind flag (`lib/data/influencer.ts` `getInfluencerSummaryMysql`,
    1:1 port of the 3-table aggregation: order_attributions + influencer_payouts + influencer_profiles).
    Parity-verified vs Supabase for a real influencer (cap/default/`applicable_countries` JSON array + zero
    totals all match). Supabase fallback on error. Auth still resolved via Supabase (pre auth-flip).
  - ✅ READ cutover COMPLETE — all dashboard reads behind the flag via `lib/data/influencer.ts`
    (summary, `/api/me/payouts`, `/api/me/wallet`, `/api/me/promos`, `/api/influencer/promos`,
    `/api/influencer/status`, `/api/me/influencer`, `/api/me/display-currency`). Each has a Supabase fallback
    on error; auth still via Supabase. Typecheck clean; all routes compile (401). Parity-verified vs Supabase:
    profile/status/currency/wallet for "Rafael" + the 5 global promos for influencer 18e15df5 all match.
  - ✅ WRITE-mirror (correctness-critical — reads are now MySQL, incl. checkout's `getPromoDetailsMysql`):
    promo create/edit/delete (`mirrorPromoIntoMysql`/`deletePromoFromMysql`), wallet save + display-currency
    (`mirrorInfluencerProfileIntoMysql`). Best-effort; typecheck clean; routes compile (401).
  - ✅ WRITE-mirror COMPLETE for influencer-side writes: payout request (`/api/me/payouts/request` AND
    `/api/me/request` — both insert influencer_payouts → `mirrorPayoutIntoMysql`) + influencer application
    (`/api/influencer/apply` RPC + `/api/influencer/request` insert → `mirrorInfluencerRequestIntoMysql`,
    replaces the user's row since MySQL enforces unique user_id). All typecheck clean + compile (401).
    (Also fixed a pre-existing untyped-RPC tsc error in `/api/me/request`.)
  - ⬜ ADMIN-side writes NOT mirrored (belong to the admin-portal migration): approve/reject influencer
    (sets influencer_profiles.active), process payout (status→processing/paid), edit cap/default/regions.
  - ⬜ Referral clicks — Supabase edge `log-referral-click` (separate edge-function migration).
  - `/api/promo/apply|clear` — promo read already on MySQL via `getPromoDetailsMysql`.
  - SLICE STATUS: storefront-influencer reads + writes all dual-write/MySQL. Admin-side + edge fn deferred.
- 🔶 Auth-session flip (capstone) — PLAN WRITTEN: `migration/AUTH_FLIP_PLAN.md` (scope: storefront + admin;
  VENDOR EXCLUDED — separate app). Verified precondition: `auth_users.id == profiles.id` for 53/53 users, and
  == `orders.user_id` — so `getCurrentUserId()` returns the same id under either backend. Blast radius: 324
  inline Supabase-auth calls across 98 route files. Strategy: (A) unify all routes onto one backend-aware
  `getRouteUser` [bulk, reversible, flag stays supabase] → (B) role in NextAuth JWT → (C) client flip
  (AuthContext/login/register, drop Bearer bridge) → (D) middleware → (E) set `AUTH_BACKEND=nextauth` + test.
  - Step A scaffolding ✅: `lib/auth/routeUser.ts` `getRouteUser(req)`/`getRouteUserId` (backend-aware:
    Supabase cookie→Bearer today, NextAuth at flip). `getCurrentUserId()` now delegates to it.
  - Step A batch 1 ✅ (8 routes): checkout/calc-totals, razorpay/create, membership/{create-order,verify,
    sync-status}, reviews/create, cart/clear, user/preferences (latter moved its profiles RLS read/write to
    the admin client + MySQL dual-write). Typecheck clean; all identical under flag=supabase (smoke verified).
  - Step A batch 2 (core) ✅: added `getRouteAuth(req)` → `{ user, sb }` (withUser drop-in; resolves Bearer
    via headers() for no-req GETs). Converted 14 routes: me/{summary,payouts,wallet,promos,influencer,
    display-currency,payouts/request,request} + influencer/{promos,promos/[id],status,apply,request}. Typecheck
    clean; all 401 unauth (identical under flag=supabase). Removed all per-route `withUser`/`getUserOr401` copies.
  - Step A batch 3 (admin) ✅ COMPLETE — built shared `lib/auth/adminGuard.ts` `requireAdmin(req)` →
    `{ user, error }` (identity via getRouteAuth; role read kept on the Supabase service-role client so gating
    is identical pre-flip; Step B moves role into the JWT). Converted ALL 39 admin route files off their
    per-route `getAdminOr401()` copies; the 4 `content-translations/*` routes via their shared
    `content-translations/_lib.ts` `getAdminOr401` (now delegates to getRouteAuth + service-role role check).
    Routes that used the user-scoped client for queries/writes repointed to the service-role/admin client
    scoped by id (story-blocks, notifications/[id]/read, settings/{shipping,cookie-consent,email-verification,
    shipping-zones,business-info,country-contacts}, payouts/[id]). Also added `mirrorPayoutIntoMysql` to
    `admin/payouts/[id]` (admin marks payout paid → influencer dashboard reads MySQL). Full typecheck clean;
    0 `createRouteHandlerClient` left in app/api/admin; sampled routes all 401 unauth.
  - Step A batch 2 tail ✅ (5): me/{country,activity,email-verification-status,email-change-request} +
    influencer/links — all on getRouteAuth/getRouteUser(Id); me/country also dual-writes preferred_country to
    MySQL. Typecheck clean; correct unauth behavior (incl. email-verification-status → 200 {authenticated:false}).
    ⇒ Batches 1 (8) + 2 (19) + 3 admin (39) = 66 routes on the unified seam.
  - Step A batch 4 ✅ — instagram/* (10 user-gated: posts, conversations[+/[id]/messages, /sync],
    posts/[id]/{comments[,/sync],publish}, comments/[id]/reply, oauth-callback) → getRouteAuth + sb;
    events/{track,identify} (optional-auth attribution) → getRouteAuth; currency/refresh (CRON_SECRET preserved
    + admin via seam); international-order (optional-auth) → getRouteUser. Typecheck clean (only the unrelated
    PRE-EXISTING `instagram/conversations/[id]/messages` ig_conversation_id select-columns type error remains).
  - ✅✅ STEP A COMPLETE for route auth resolution. **75** route files on the seam. Remaining
    `createRouteHandlerClient` is ONLY: `auth/*` (6: attach/callback/meta-ig-callback/oauth-signup-complete/
    verify-email-resend/welcome-email → handled in Step C, they run inside the Supabase auth flow),
    `debug/whoami`+`_whoami` (debug-only, delete or convert later), `vendor/notify-signup` (EXCLUDED).
- ✅ Step B (role in NextAuth JWT) COMPLETE — `authOptions.jwt` reads `profiles.role` (MySQL) onto the token
  at sign-in; `session` callback exposes `session.user.role`; `getSessionUser` returns `role`; `requireAdmin`
  now branches: AUTH_BACKEND=nextauth → role from the JWT session (no DB lookup), else the service-role lookup
  (current behavior). Additive + typecheck clean; NextAuth route still 200; MySQL profiles has 4 admin + 1
  super_admin to source from. No behavior change pre-flip.
- 🔶 Step C (client/auth flip) — IN PROGRESS:
  - ✅ Registration = DUAL-WRITE (Option 1, chosen because the VENDOR app still uses Supabase Auth, so
    auth.users must stay complete). `/api/auth/register` now creates the account in BOTH Supabase Auth
    (admin.createUser → trigger makes Supabase profiles) AND MySQL `auth_users` (bcrypt) + `profiles`, SAME id,
    with Supabase rollback if the MySQL half fails. `AuthContext.register` routes through it then
    signInWithPassword (establishes the Supabase session as before). VERIFIED end-to-end: throwaway signup
    landed in all 4 places with one consistent id, then cleaned up. AuthContext typecheck clean; pages 200.
    ⏳ BROWSER TEST NEEDED: click-through register on /auth/register → confirm logged in + (optional) both stores.
  - ✅ AuthContext dual-mode IDENTITY READER (gated on NEXT_PUBLIC_AUTH_BACKEND): under nextauth, identity from
    `useSession()` + `/api/me/profile` (role from the JWT); else current Supabase. login/logout/refreshProfile
    branched too. Typecheck clean; default (Supabase) path verified (/, /auth/login, /account all 200);
    NextAuthProvider has SessionProvider. This is the READER half — components read user/isAdmin via useAuth().
  - ⚠️ KEY FINDING: the login + register PAGES (`app/auth/login/login.tsx`, `app/auth/register/register.tsx`)
    do their OWN Supabase auth directly (signUp / signInWithPassword / signInWithOAuth + the /api/auth/attach
    bridge), NOT via useAuth(). So the real auth-ENTRY flip lives in the PAGES, and `AuthContext.register`'s
    dual-write is currently UNUSED by the page. ⇒ To make Option 1 actually live, the REGISTER PAGE's onSubmit
    must call `/api/auth/register` (dual-write, always-on during transition) instead of `supabase.auth.signUp`.
  - ✅ REGISTER page flipped — onSubmit now calls `/api/auth/register` (always-on dual-write = Option 1 LIVE)
    then signs in (signInWithPassword now / signIn(credentials) at flip); country-write + events + welcome-email
    preserved (bearer header only on the legacy path). Typecheck clean; pages 200. ⚠️ LIVE behavior change to
    signup — needs a browser register test. NOTE: replaces Supabase's email-confirmation gate with immediate
    sign-in + the app's own custom verification (profiles.email_verified_at grace) — which is the intended flow.
  - ✅ LOGIN page flipped (gated) — credentials→signIn(nextauth)/signInWithPassword(else); OAuth→signIn(provider)
    /signInWithOAuth(else); already-logged-in check via useSession(nextauth)/getSession(else). Default path
    unchanged. Typecheck clean; pages 200.
  - ✅ C-tail (server side): `authOptions.events.createUser` creates the `profiles` row for OAuth signups (adapter
    only makes auth_users); `welcome-email` + `verify-email/resend` auth resolution → `getRouteUser` (so they work
    under NextAuth, called post-register; email lookup still via Supabase admin which is fine since dual-write
    created the Supabase user). Typecheck clean. `auth/callback` + `oauth-signup-complete` are Supabase-OAuth-only
    → left as-is (NextAuth uses its own /api/auth/callback/[provider]). `/api/auth/attach` route left (harmless;
    login/register pages already gate their attach calls to the Supabase path).
  - ✅ Step D (middleware) — gated on AUTH_BACKEND: under nextauth, Supabase session-refresh runs ONLY for the
    VENDOR app (still Supabase); storefront /account,/admin,/checkout skip it (NextAuth validates its JWT per
    route). Preference-cookie seeding unchanged for all. Default path unchanged.
  - 🔶 LAST C PIECE (client components) — helper built + first conversion done:
    - ✅ `lib/auth/clientAuth.ts`: `useAuthSession()` (hook → `{ ready, userId, token, authHeaders }`; under
      nextauth `token` is a truthy SENTINEL so existing `if (token)` gates keep firing, auth via cookie) +
      `clientAuthHeaders()` (async, for event handlers). Drop-in for `supabase.auth.getSession()→access_token`.
    - ✅ Influencer dashboard READS (`app/influencer/page.tsx`): token bootstrap → `useAuthSession()`; dropped the
      old getSession + /api/auth/attach bridge. Dashboard data now loads under both backends. Typecheck clean.
    - ✅ DONE — added `clientAuthToken()` to the helper (drop-in for the inline `getSession()→access_token`).
      Audited all 31 token-using client components. KEY FINDING: a component only BREAKS under NextAuth if it
      HARD-GATES on the Supabase session token (`if(!token) return/redirect` BEFORE fetching). Components that
      merely put the token in a header work as-is — the stale/sentinel Bearer is ignored server-side (getRouteAuth's
      nextauth path never reads the header) and the NextAuth cookie rides along (same-origin fetch default).
      Render-gating is handled by AuthContext (already dual-mode). So only THREE surfaces — all gaters — needed
      conversion; all done, typecheck clean, compile OK:
        • `app/influencer/page.tsx` — dashboard reads → `useAuthSession()`; 4 modal handlers → `clientAuthToken()`
          (replace_all caught all 4); dropped old getSession + /api/auth/attach bridge.
        • `app/influencer/payouts/page.tsx` — token state + bootstrap → `useAuthSession()`.
        • `app/influencer-request/page.tsx` — `getAccessTokenOrRedirect()` → `clientAuthToken()` (no longer kicks
          authed NextAuth users to /login); its attach effect self-no-ops under nextauth (getSession returns null).
      NOT converted (correct as-is): ~17 admin/* pages + account/settings (token inline in header, no gate → cookie
      auth) · `verify-email` (its `token` is the URL verification token, not the session) · vendor pages (EXCLUDED).
    - ⚠️ ONE deferred to STORAGE phase: `app/admin/cms/k-partnership-videos/page.tsx` gates the Supabase token for a
      DIRECT-to-Supabase-Storage XHR upload — coupled to Supabase Storage, not the auth seam (a sentinel can't sign a
      real storage upload). Breaks under nextauth until Storage→S3. Tracked with the storage migration, not the flip.
  - ✅ PRE-FLIGHT PROOFS (2026-06-20) — runbook: migration/STEP_E_RUNBOOK.md:
    - Register dual-write PROVEN via real browser signup: `thakur33233@gmail.com` → all 4 stores, one id
      `f4394d62…`, role customer, hash present, confirmed (`migration/etl/verify-register.mjs`). Duplicate guard
      also proven (existing admin email → 409, untouched).
    - NextAuth credentials login + role-in-JWT PROVEN server-side (`migration/etl/test-nextauth-login.mjs`):
      register→csrf→credentials callback→/session returned `{user.id, user.role}`. Authenticates bcrypt hash,
      stamps role. ⇒ admin gating will resolve post-flip. Done WITHOUT flipping (NextAuth endpoints always mounted).
    - ⚠️ GOTCHA for the flip: `NEXTAUTH_URL=:3000` but dev server on :3001 → credentials OK (port-agnostic cookies),
      but OAuth redirects to :3000 and fails. Align NEXTAUTH_URL (or run on 3000) before testing OAuth.
    - 🔴→✅ BLOCKER FOUND & RESOLVED (the reason test-first mattered): cart writes + CHECKOUT break under nextauth.
      The Supabase RPCs `ensure_cart`/`add_to_cart`/`update_cart_item`/`remove_cart_item`/`merge_cart` and
      `create_order_from_cart` derive the user from `auth.uid()` (verified via pg_proc), NULL without a Supabase
      session. 11 routes used the anon `supabaseRouteClient` (cart×2, orders/create, reviews×3, account×5).
      FIX (NO SECRET — minted-JWT idea dropped since SUPABASE_JWT_SECRET isn't reachable):
        • DB migration `nextauth_cart_order_as_user_wrappers` (APPLIED): six service-role-ONLY `*_as(p_user_id,…)`
          wrappers that `set_config('request.jwt.claim.sub', p_user_id)` then delegate to the original RPC, so
          `auth.uid()` resolves inside. Granted to service_role only (anon/authenticated revoked → no impersonation).
        • `lib/supabaseRoute.ts`: `supabaseForUser(userId)` → service-role client under nextauth (RLS-bypassing,
          caller scopes by userId), else cookie client; `rpcForUser(sb,userId,fn,args)` → `<fn>_as` under nextauth.
        • ALL 11 routes converted; every query audited for explicit `user_id` scoping (service-role bypasses RLS) —
          fixed `reviews/votes` which had relied on RLS. Typecheck clean.
        • PROVEN at DB level: `migration/etl/test-as-wrappers.mjs` → ensure→add(qty2,₹5036)→create_order, order
          MIK20260620-… owned by the test user. (`supabaseAsUser.ts` minted-JWT helper deleted.)
  - ✅ STEP E ROUTE-LEVEL PROOF (2026-06-20): single server flipped via process-env (AUTH_BACKEND +
    NEXT_PUBLIC_AUTH_BACKEND) on :3000; `migration/etl/test-checkout-nextauth.mjs` → register + nextauth login +
    cart add (200) + cart state (1 item) + calc-totals (200) + **orders/create (200, real order MIK20260620-949587ba)**
    ALL GREEN. Entire server-side money path works under NextAuth. Only the literal Razorpay payment (browser +
    test card) is unautomatable; razorpay/verify is backend-agnostic (service-role + explicit ids).
  - 🔎 2nd CLIENT SWEEP — `supabase.auth.getUser()` (the earlier sweep only caught getSession/access_token). Found
    via the user's browser checkout: the order-success page showed "Auth session missing!" because it called
    `supabase.auth.getUser()` (returns AuthSessionMissingError under NextAuth). Converted all storefront/account
    sites — order succeeds, the error is gone:
      • `app/order/success/page.tsx` → `/api/account/orders[/(id)]` · `app/checkout/checkout.tsx` (membership +
        address load + address save) → `/api/me/membership`, `/api/account/addresses`, `/api/account/profile`
      • `app/influencer/layout.tsx` (RSC GATE — was redirecting EVERY influencer to login post-flip) → backend-aware
        (getServerSession under nextauth, else sb cookie) + service-role role/influencer reads
      • `components/AccountMembershipCard.tsx`, `app/cart/page.tsx`, `app/k-plus/page.tsx` (userId via AuthContext),
        `app/account/orders/[orderId]/invoice/page.tsx`, `app/products/[slug]/product.tsx` (reviews userId/isAdmin
        via AuthContext; review-snapshot name via `/api/me/profile`)
      • NEW `app/api/me/membership/route.ts` (backend-aware membership read). supabase kept ONLY for public reads
        (published products, storage URLs). All typecheck clean (84 baseline, 0 new); pages compile on :3000.
    ✅ ADMIN (3 pages) — GATING + DATA both converted (admin-portal data migration for these pages DONE):
      • GATE: `getUser()` + `is_admin` RPC (auth.uid-based, bounced admins) → `useAuth().isAdmin` (dual-mode).
      • DATA: built admin API routes (all `requireAdmin` + service-role): `GET /api/admin/vendors`,
        `GET+PATCH /api/admin/vendors/[id]` (approve/suspend/commission; approved_by = the acting admin),
        `GET /api/admin/influencers/requests`, `POST /api/admin/influencers/decision` (approve/reject — the RPCs
        are auth.uid-FREE, verified via pg_proc, so service-role works directly, NO _as wrappers needed),
        `GET /api/admin/influencers/payouts`, `PATCH /api/admin/influencers/payouts/[id]`. Pages call these;
        emails still via the existing cookie-auth `/api/admin/users/lookup`.
      • PROVEN end-to-end under NextAuth (`migration/etl/test-admin-nextauth.mjs`): register → promote to admin
        (MySQL profiles, read by the jwt callback) → nextauth login (session.role=admin) → GET vendors(4) +
        requests(27) + payouts(0) all 200/ok. Typecheck clean (84 baseline, 0 new); pages compile on :3000.
      • `admin/cms/k-partnership-videos` = storage-deferred. Vendor `(public)/register` EXCLUDED.
      ⇒ AUTH FLIP is now functionally COMPLETE for BOTH customer AND admin surfaces under NextAuth.
  - REMAINING for Step E = a human browser pass on :3000: creds login, browse, CHECKOUT+test-pay (confirm order in
    /account/orders), /admin, /influencer, logout. Then persist (add the 2 flags to .env.local) or rollback (restart
    without them). Login/influencer/logout already confirmed by the user on an earlier (Supabase-backend) pass.
  - NOTE: register's `seedProfilePreferences`/me/country preference mirror to MySQL still partial (explicit-change
    paths already dual-write).
  - ⬜ D (middleware → NextAuth JWT on /account,/admin,/checkout; keep Supabase refresh for /vendor) →
    E (set AUTH_BACKEND=nextauth + NEXT_PUBLIC mirror + full test matrix: creds+OAuth login / browse / cart /
    checkout / influencer / admin / rollback).

- 2026-06-16 — Auth foundation: migrated all 53 Supabase Auth users (bcrypt, no reset) + OAuth links into
  MySQL; stood up NextAuth (credentials + Google + Facebook) and verified the credentials/bcrypt + OAuth
  linkage mechanisms. App rewiring deferred to the integration step. Saved memory [[auth-migration-export-no-reset]].

## Read-path cutover (storefront → MySQL), per surface
Flag: `CATALOG_BACKEND=mysql` (unset/anything else = Supabase, the safe default + instant rollback).
- ✅ **Home rails** (`app/page.tsx` → `fetchEditorial`) — repointed via `getEditorialProducts` +
  `applyCountryOffers` in `lib/data/catalog.ts`. Verified: rails render from MySQL (5 featured / 5 trending),
  translations + country offers + image URLs preserved. Images still resolve from Supabase Storage (S3 phase).
- ✅ **Product detail** (`app/products/[slug]/page.tsx`) — all server fetches gated on the flag:
  product+translations (`getProductDetailBySlug`), images (`getProductImagesMysql`), story blocks
  (`getStoryBlocksMysql`), review stats (`getReviewStatsMysql` — reproduces the unmigrated
  `product_review_stats` view via a Prisma aggregate), country offers (`fetchCountryOffersMysql`).
  Verified: PDP renders HTTP 200 with name, images, pricing, and JSON-LD aggregateRating from MySQL.
  (Client component `product.tsx` still does its own browser reads for the review *list* / related —
  repoint those via `/api/catalog/*` later.)
- ✅ **Whole homepage** — all remaining home data flipped (`lib/data/home.ts`):
  banners (`getBannersMysql`), brand carousel (`getBrandsLiveMysql` — reproduces `brands_live`'s
  published-product count), influencer videos + product-video carousel (M:N via junction tables,
  reproducing the `_live` views' active+schedule filter), and `home_video_limit` from `store_settings`.
  Verified: full home renders HTTP 200 from MySQL, no errors.
- ✅ **Brand / category / search pages** — all repointed (`lib/data/catalog.ts`):
  `/brands` (`getBrandsDirectoryMysql`), `/brand/[slug]` (`getBrandWithTranslationsBySlug` +
  `getBrandProductsMysql` + static params + metadata), `/c/[slug]` (category equivalents),
  `/search` (`searchProductsMysql` — replaces the `search_products_tsv` tsvector RPC with MySQL
  `FULLTEXT MATCH … AGAINST` on `products_ft(name, short_description, description)`, with a `LIKE`
  fallback for short tokens). Verified: all four render HTTP 200 from MySQL.
  Note: FULLTEXT relevance differs slightly from tsvector (e.g. "serum" → 12 vs 7) — acceptable;
  swap to an external engine later only if search quality needs it.
- ✅ **PDP related-products widget** — first CLIENT-component cutover. Browser → `/api/catalog/related`
  → MySQL (`getRelatedProductsMysql`). The flag lives in the route (client can't read server env).
  Pattern established for all future client-side reads. Verified: 8 country-priced items, PDP HTTP 200.
- ⬜ **PDP review system** (list + helpful votes + edit/delete) — deferred to the AUTH phase: it's
  entangled with the logged-in user + RLS (votes, "my review", writes), so it migrates as one unit
  once NextAuth lands. (Anonymous list read could move sooner but would create a fragile hybrid.)
- ⬜ Other read collections (`/best-seller`, `/shop-199`)
- ⬜ Checkout-path `getShippingConfig` (store_settings) — defer to the money-path phase

- 2026-06-16 — Built MySQL read path: Prisma singleton + serializer + catalog DAL + `/api/catalog/*` routes;
  verified end-to-end via dev server (price→number, BigInt→number, TINYINT→boolean, JSON + relation joins OK).
  Saved project memory: migrate existing users by export/import (bcrypt), never reset.
