# Supabase Decommission Runbook (MySQL-authoritative cutover)

Goal: MySQL is the single source of truth; Supabase (Auth + Postgres + Storage) removed entirely.
Status: storefront already READS MySQL (`CATALOG_BACKEND=mysql`); writes are still Supabase-first.

## The golden rule
**Drop Supabase writes LAST.** Keep MySQL+Supabase in sync (dual-write) until EVERY reader is off
Supabase, then remove. Premature MySQL-only writes make Supabase stale and break anything still
reading it — most dangerously the money-path RPCs, which read catalog/promo data from Supabase.

## Supabase touchpoints (what must move)

### A. Reads still on Supabase
- Admin pages read catalog/CMS client-direct from Supabase (anon `supabase.from(...).select`):
  `app/admin/products/page.tsx`, `app/admin/cms/{banners,brands,categories,product-video,influencer-video}/page.tsx`.
- Storefront catalog/account reads are already MySQL (`lib/data/*`). ✓

### B. Writes still on Supabase
- **B1 Client-direct (BROKEN under NextAuth — RLS-denied, silent):** the 7 pages in A above + the
  product editors (`components/admin/ProductEditor.tsx`, `app/admin/products/[id]/AdminProductEditor.tsx`,
  `ProductForm.tsx`, `ProductStoryEditor.tsx`) + `app/vendor/(protected)/products/page.tsx`.
- **B2 Server-routed (work; Supabase-authoritative + MySQL mirror):** cart/order/promo/membership/
  attribution APIs, all `/api/admin/*` routes. These write Supabase then mirror MySQL.

### C. Business logic in Supabase (Postgres) — the hard part
- RPCs: `ensure_cart`/`add_to_cart`/`update_cart_item`/`remove_cart_item`/`merge_cart`/`clear_my_cart`,
  `create_order_from_cart`, `get_promo_details` + promo-increment, `request_influencer`,
  `get_my_wallet_meta`/`save_my_wallet_meta`, `approve/reject_influencer`,
  `influencer_available_to_withdraw`, + every `*_as` wrapper.
- RLS policies (all `auth.uid()`-based) → replace with app-layer auth (the seam already does this server-side).
- Triggers (e.g. `guard_super_admin_role`, promo max-uses), views (`product_review_stats`), tsvector search.

### D. Supabase Auth admin calls
- `supabase.auth.admin.getUserById/listUsers/updateUserById/deleteUser`, PrismaAdapter aside.
  Sites: reset-password, email-change (request+approve), `/api/admin/users/[user_id]`, oauth-signup-complete.

### E. Supabase Storage
- Already on S3/CloudFront. Remaining: rewrite stored full-Supabase `_url` columns (brands/banners/home
  videos) to keys before deleting the buckets. Then drop buckets.

## Phase order

**Phase 1 — Catalog/CMS admin CRUD → server endpoints (fixes QA bugs).** Route the B1 client-direct
writes through admin-gated server endpoints (service-role Supabase write + `mirrorTableToMysql`, so the
write succeeds under NextAuth AND both DBs stay in sync). Flip the admin reads (A) to MySQL (Prisma).
Reference built: `app/api/admin/catalog/products/route.ts` + `app/admin/products/page.tsx`.
Remaining: banners, brands, categories, product-video, influencer-video, the product editors, vendor list.

**Phase 2 — Money path → MySQL (test-heavy).** Reimplement the cart/order/promo/attribution RPCs (C) as
Prisma transactions in `lib/data/*` write helpers; point `razorpay/verify` + cart routes at them. Run the
money-path test + a manual Razorpay test-card pass after each. This is the high-risk phase.

**Phase 3 — Auth admin + remaining logic → MySQL.** Replace the D `supabase.auth.admin.*` calls with
MySQL/Prisma equivalents (users live in MySQL). Port remaining triggers/views/search to MySQL.

**Phase 4 — Flip MySQL-authoritative + decommission.** Once NOTHING reads Supabase: switch the dual-write
endpoints to MySQL-only (drop the Supabase write), remove the Supabase clients/imports, rewrite the `_url`
columns (E), delete the buckets, and retire the Supabase project.

## Rollback
Every phase keeps the Supabase data intact (dual-write) until Phase 4, so any phase is reversible by
re-pointing reads back to Supabase — you only lose that the moment Phase 4 deletes the Supabase side.
