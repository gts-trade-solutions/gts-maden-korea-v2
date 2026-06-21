# Live Supabase DB Inventory — `madenkorea`

Pulled directly from the production Supabase project via MCP on 2026-06-16.
Source engine: **PostgreSQL 17.6** · project `bjudxntmpfpbyloibloc` · region `ap-southeast-1`.

> This is the authoritative inventory for the MySQL migration. It supersedes the
> table/RPC lists in CODEBASE_REFERENCE.md, which under-counted the live schema.

## Headline counts

| Object | Count | Notes |
|---|---|---|
| Base tables | **106** | Docs claimed ~85 |
| User functions (plpgsql/sql) | **124** | ~40 are trigger fns, ~80 are RPCs/business logic |
| Views | **9** | incl. `_live` views + `products_with_pricing` |
| Triggers | **~60** | across ~40 tables |
| Enum types | **14** | must become CHECK constraints / lookup tables in MySQL |
| Extensions | 6 | `pg_trgm`, `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements`, `plpgsql` |
| RLS policies | **~230** across 72 tables | 35 tables have RLS **disabled** (see security note) |

## 🔴 Security finding (surfaced from Supabase advisor)

**35 tables have Row Level Security DISABLED** — they are fully readable/writable by
anyone holding the anon key today: including `orders`, `order_items`, `customers`
(426 rows), `inventory_units`, `invoice_companies`, `user_memberships`,
`password_reset_tokens`, `membership_plans`, and the entire `facebook_*` set.
This is a pre-existing exposure in the current Supabase app, independent of the
migration. The migration to app-layer auth is an opportunity to close it, because
every one of those tables must get an explicit authorization check in its new API route.

## Extensions → MySQL impact

- **`pg_trgm`** — trigram fuzzy search (`similarity()`, `word_similarity()`), used by
  product search. 🔴 No MySQL equivalent. Replace with `FULLTEXT` index + `MATCH…AGAINST`,
  or an external engine (Meilisearch/Typesense). Search quality will differ.
- **`pgcrypto` / `uuid-ossp`** — UUID + hashing. Map to MySQL `UUID()` / `SHA2()` or
  generate UUIDs in the app layer (recommended for consistency).
- **`supabase_vault`** — encrypted secret storage. Confirm whether any secrets (IG/FB
  tokens?) live here; if so they need a new home (env vars or an app secrets table).
- `pg_stat_statements` — observability only, no migration action.

## Enum types (14) — become CHECK or lookup tables in MySQL 8

`banner_variant`, `dtdc_shipment_status`, `email_delivery_event`,
`email_recipient_status`, `email_send_status`, `email_target_type`,
`ig_campaign_status`, `ig_media_type`, `ig_message_direction`, `ig_post_status`,
`ig_sender_type`, `inventory_status`, `whatsapp_campaign_status`,
`whatsapp_message_status`.

## Views (9) — re-create as MySQL views or fold into queries

`brands_live`, `home_banners_live`, `home_influencer_videos_live`,
`home_product_videos_live`, `product_review_stats`, `product_wishlist_counts`,
`products_with_pricing`, `vendor_product_expiry_status`, `vendors_public`.

## Tables by subsystem (106) with live row counts

### Core storefront / commerce
profiles (53), products (183), product_images (283), product_videos (30),
product_story_blocks (12), brands (28), categories (4), product_country_prices (589),
currency_rates (12), store_settings (1), store_credits (0).

### Cart & orders
carts (52), cart_items (23), orders (1), order_items (1), payment_orders (1),
payments (0).

### Account
addresses (4), wishlist_items (2).

### Reviews
product_reviews (5633), review_votes (2).

### Inventory / ERP (NOT in codebase docs)
inventory_units (3869), inventory_events (0), batches (2), invoice_batch_items (0),
inventory_units_bulk_delete_audit (6), customers (426).

### Invoicing (NOT in codebase docs — large subsystem)
invoices (66), invoice_items (185), invoice_companies (3), invoice_counters (1),
invoice_addresses (48), invoice_units (1211), invoice_payments (0).

### Vendor
vendors (4), vendor_members (4), role_grants (0), app_admins (0).

### Influencer / referral
influencer_profiles (26), influencer_requests (26), influencer_payouts (0),
influence_caps (1), referral_links (0), referral_clicks (0), promo_codes (9),
order_attributions (0), order_attribution_items (0).

### Membership
user_memberships (2), membership_plans (1).

### Shipping / DTDC
dtdc_shipments (1), dtdc_shipment_events (0), dtdc_api_logs (12),
dtdc_tracking_tokens (0), shipping_zones (6), pincodes (19238),
pincode_serviceability_cache (0), country_shipping_rates (15).

### International / i18n
international_orders (13), country_contacts (3), product_translations (385),
brand_translations (224), category_translations (32), banner_translations (64).

### CMS / home
home_banners (48), home_product_videos (10), home_influencer_videos (7),
home_product_video_products (15), home_influencer_video_products (9),
k_partnership_videos (8).

### Email marketing
email_category (10), email_contact (20), email_contact_category (20),
email_campaign (8), email_campaign_category (0), email_campaign_recipient (15),
email_unsubscribe (0), email_verification_tokens (1), email_change_requests (0).

### WhatsApp
whatsapp_contacts (1), whatsapp_templates (2), whatsapp_campaigns (16),
whatsapp_campaign_messages (15).

### Instagram / Facebook / social
instagram_accounts (1), instagram_conversations (0), instagram_messages (0),
instagram_media_posts (21), instagram_comments (4), campaigns (0), campaign_posts (0),
social_scheduled_posts (46), social_schedules (0), facebook_campaigns (0),
facebook_adsets (0), facebook_ads (0), facebook_insights (0), facebook_page_posts (48),
facebook_page_comments (1).

### Analytics / notifications / misc
events (14003), admin_notifications (6), admin_notification_reads (5),
notification_recipients (4), password_reset_tokens (22), contact_messages (6),
_delete_debug (1).

## Key business-logic functions to re-implement (TS services in MySQL world)

Cart: `ensure_cart`, `add_to_cart`, `update_cart_item`, `remove_cart_item`,
`merge_cart`, `cart_clear`, `cart_clear_for_user`, `recalculate_cart_totals`,
`toggle_wishlist`.
Orders/checkout: `create_order_from_cart`, `create_order`, `mark_order_paid`,
`recalculate_order_totals`, `next_order_number`, `allocate_order_units`,
`revert_order_units`.
Promo/referral/attribution: `validate_promo`, `get_promo_details`, `create_promo_code`,
`attribute_order`, `effective_split_for_product`, `enforce_influence_budget`,
`get_referral_context`, `resolve_referral_target`, `log_referral_click`,
`create_referral_link`.
Influencer: `request_influencer`, `approve_influencer`, `reject_influencer`,
`influencer_dashboard_stats`, `influencer_recent_orders`, `influencer_timeseries`,
`get_my_wallet_meta`, `save_my_wallet_meta`.
Pricing/catalog: `get_effective_price`, `get_influence_cap`, `search_products_tsv`,
`sync_product_hero_og`.
Address/vendor: `upsert_address`, `set_default_address`, `delete_address`,
`get_my_addresses`, `register_vendor`, `get_my_vendor`, `add_vendor_member`,
`remove_vendor_member`, `list_vendor_members`.
Invoicing: `create_invoice_atomic`, `update_invoice_atomic`, `create_invoice_with_items`,
`generate_invoice_number`, `next_invoice_number`, `add_invoice_payment`,
`recompute_invoice_payment`, `soft_delete_invoice`, `restore_invoice`, `purge_invoice`,
`revert_invoice_units`, plus invoice dashboard/aging/outstanding reporting fns.
Auth/roles: `is_admin`, `has_role`, `is_vendor_admin`, `is_vendor_member`,
`handle_new_user` (auth.users trigger), `guard_super_admin_role`,
`profiles_block_role_change`.
Shipping: `lookup_pincode_eta`.

## Critical Postgres→MySQL translation risks

1. `uuid` PKs everywhere → `CHAR(36)` (or `BINARY(16)`); generate UUIDs in app.
2. `jsonb` (heavily used in invoice/attribution payloads) → `JSON` (no GIN ops).
3. `pg_trgm` search → MySQL `FULLTEXT` (quality change).
4. ~60 triggers → port to MySQL triggers or move into the app service layer.
5. ~230 RLS policies → re-implement as app-layer authorization in each API route.
6. `auth.users` (Supabase Auth schema) → own `users` table + auth system.
7. Atomic multi-step RPCs (cart/order/invoice) → MySQL transactions with `SELECT … FOR UPDATE`.
8. Composite `RETURNS record/SETOF` functions → typed service return shapes.
