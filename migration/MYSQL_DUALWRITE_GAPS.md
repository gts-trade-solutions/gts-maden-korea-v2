# MySQL Dual-Write Coverage & Gaps

From the 2026-06-21 audit (4-domain workflow). A **gap** = a Supabase write whose table is READ from MySQL
(`CATALOG_BACKEND=mysql`) but which doesn't mirror to MySQL → stale storefront/account (the ₹399 class).

## Correctly dual-written (no action)
`orders`/`order_items` (create+paid), `carts`/`cart_items` (mutate+verify-clear), `user_memberships`, `promo_codes`,
`order_attributions` (initial), `addresses`, `product_reviews`, `review_votes`, profile create + the dedicated
profile/preferences/country routes. Mirror helpers in `lib/data/*` (`mirror{Order,Cart,Memberships,Promo,Payout,
InfluencerProfile,InfluencerRequest,OrderAttribution}IntoMysql`).

## NOT gaps (Supabase-only by design — never read from MySQL)
`wishlist_items`, `referral_clicks`, `email_change_requests`, all `instagram_*/facebook_*/social_*/campaign*`,
`email_*`, `whatsapp_*`, CMS static-pages/media/coupons.

## The generic mirror (the mechanism that closed the cluster)
`lib/data/mirror.ts#mirrorTableToMysql(table, scopeVal?)` — column-safe + FK-safe Supabase→MySQL re-sync of one
table (or one product/order scope), same approach as `data-copy.mjs`. Two front doors:
- **Server routes** import it directly.
- **Browser-direct CMS writes** keep their Supabase write, then fire `lib/admin/mirror-mysql.ts#mirrorMysql(table,
  scopeVal?)` → `POST /api/admin/mysql-mirror` (admin-gated) → `mirrorTableToMysql`. Fire-and-forget.
Allowlist (`MIRRORABLE`): orders, products, product_images, product_videos, product_country_prices,
product_story_blocks, product_translations, brand_translations, category_translations, brands, categories,
home_banners, home_product_videos, home_influencer_videos, the two home_*_video_products join tables,
k_partnership_videos, store_settings. Endpoint tested 7/7 with matching counts.

## Post-audit P1 fixes (2026-06-21, second pass)
- **Admin product LIST page** (`app/admin/products/page.tsx`) — editorial flags (featured/trending/new_until),
  delete, and bulk publish/unpublish now `mirrorMysql("products", id)`. (Only the detail editors mirrored before.)
- **Content-translations** (`/api/admin/content-translations/{translate,[kind]/[id]}`) — AI translate + manual edit
  + locale delete now mirror `product_/brand_/category_translations` (scoped by entity id). banners self-skip.
- **Auth write-path regressions** (NextAuth, separate from MySQL): password reset now dual-writes the bcrypt hash to
  `prisma.user.passwordHash` (else reset users stayed locked out); influencer `apply`, `wallet` GET/POST, `promos`
  GET/POST, and payout `request` rewired to the service-role seam — incl. three new `_as` wrappers
  (`request_influencer_as`, `get_my_wallet_meta_as`, `save_my_wallet_meta_as`, service_role-only, write→read→restore
  proven against live DB).

## ✅ Fixed this session
**Server-side (mirror added in the route):**
- product_country_prices — `PUT /api/admin/products/[id]/country-prices`.
- cart_items/carts — `/api/cart/clear` → `clearCartMysql`.
- influencer_payouts — `PATCH /api/admin/influencers/payouts/[id]` → `mirrorPayoutIntoMysql`.
- influencer_requests/_profiles — `POST /api/admin/influencers/decision` (approve/reject).
- influencer_profiles — `PATCH /api/admin/influencers/[user_id]` (cap/discount/countries).
- order_attributions — `PATCH /api/admin/commissions` + `/api/cron/commission-approve` (status flips).
- profiles — `PATCH /api/admin/users/[user_id]` (role change; **JWT reads role from MySQL**). **DELETE** also clears
  the MySQL user/profile — SECURITY: otherwise a deleted account keeps its NextAuth bcrypt credentials and can log in.
- orders — `/api/dtdc/track` (shipping status → order status).
- k_partnership_videos + store_settings — `/api/admin/k-partnership-videos` POST/DELETE/PATCH.
- home_*_video_products join tables — `/api/admin/video-products` (replace-all).

**Client-side CMS (mirrorMysql fired after the existing Supabase write):**
- product_story_blocks — `ProductStoryEditor` (5 sites, scoped).
- home_product_videos / home_influencer_videos — `cms/product-video` / `cms/influencer-video` (4+4).
- home_banners / brands / categories — `cms/banners` / `cms/brands` / `cms/categories` (3+2+2).
- products / product_images / product_videos — `ProductEditor`, `AdminProductEditor`, `ProductForm` bulk import (scoped).
- orders — `admin/orders/[id]` status change (scoped).

## ⬜ Residual (low-impact, documented)
- `payments` standalone writes (the paid path already mirrors via the order). Low.
- A couple of minor `profiles` UPDATE sites (non-role profile fields). Role + the dedicated profile/preferences/
  country routes already mirror; these are cosmetic until MySQL is authoritative.

## Stopgap re-sync (for a one-time full refresh)
The generic `migration/etl/data-copy.mjs` clears + re-copies any table list Supabase→MySQL (idempotent), e.g.:
```
# needs SUPABASE_DB_URL (Supabase Postgres conn string) + MYSQL_URL in env
node migration/etl/data-copy.mjs products product_images product_videos product_story_blocks \
  categories brands home_banners home_product_videos home_influencer_videos \
  home_product_video_products home_influencer_video_products k_partnership_videos store_settings
```
(A per-table `sync-country-prices.mjs`-style script using the Supabase JS client works too if the direct PG URL
isn't available.)
