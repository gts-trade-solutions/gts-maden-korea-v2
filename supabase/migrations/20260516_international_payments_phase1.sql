-- International Payments Phase 1: schema additions only.
-- Spec: INTERNATIONAL_PAYMENTS.md
-- All additions are nullable / defaulted so existing rows and the
-- India checkout flow are not disturbed. App layer will enforce
-- presence on the international code path.

-- ─────────────────────────────────────────────────────────────────
-- 1. country_shipping_rates
--    One row per supported destination country. Indian shipping is
--    handled by the existing store_settings + K-Plus logic, so IN is
--    intentionally not in this table; the international calc path
--    will branch on country.
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.country_shipping_rates (
  country            text        primary key,
  rate_per_gram_inr  numeric     not null check (rate_per_gram_inr >= 0),
  active             boolean     not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table  public.country_shipping_rates is
  'Per-country international shipping rate in INR/gram. Order shipping = sum(product.net_weight_g * qty) * rate_per_gram_inr, then FX-converted to buyer currency.';
comment on column public.country_shipping_rates.country is
  'ISO-3166-1 alpha-2 destination country code. India (IN) is intentionally excluded; India uses the existing store_settings threshold flow.';

create index if not exists country_shipping_rates_active_idx
  on public.country_shipping_rates(active)
  where active = true;

-- Keep updated_at fresh on edits. Mirror the pattern used elsewhere
-- in the schema (store_settings, currency_rates, etc).
create or replace function public.country_shipping_rates_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists country_shipping_rates_touch_updated_at on public.country_shipping_rates;
create trigger country_shipping_rates_touch_updated_at
  before update on public.country_shipping_rates
  for each row execute function public.country_shipping_rates_touch_updated_at();

-- RLS: read is public (the storefront needs the rate to show shipping
-- on checkout for non-IN visitors); writes are admin-only via
-- service-role from /api/admin endpoints.
alter table public.country_shipping_rates enable row level security;

drop policy if exists country_shipping_rates_select_public on public.country_shipping_rates;
create policy country_shipping_rates_select_public
  on public.country_shipping_rates
  for select
  using (true);

-- No insert/update/delete policy → only service role bypasses RLS.

-- ─────────────────────────────────────────────────────────────────
-- 2. orders: dual-currency view
--    Going forward, orders.{subtotal,shipping_fee,discount_total,total}
--    are stored in the BUYER's currency (matches what Razorpay
--    charged). The new *_inr columns hold the INR-equivalent at
--    order time, plus fx_rate_snapshot for reconstruction.
--    All columns are nullable so existing rows (all INR) stay valid;
--    code reading them backfills sensibly (total_inr = total when
--    currency='INR').
-- ─────────────────────────────────────────────────────────────────
alter table public.orders
  add column if not exists fx_rate_snapshot   numeric,
  add column if not exists subtotal_inr       numeric,
  add column if not exists shipping_fee_inr   numeric,
  add column if not exists discount_total_inr numeric,
  add column if not exists total_inr          numeric;

comment on column public.orders.fx_rate_snapshot is
  'currency_rates.rate_from_inr captured at Razorpay order creation. Null = INR order or pre-international row.';
comment on column public.orders.total_inr is
  'INR-equivalent of orders.total at order time. Used for analytics rollups across currencies. Null on legacy INR rows; treat as = total when null AND currency=INR.';

-- ─────────────────────────────────────────────────────────────────
-- 3. products.net_weight_g
--    Spec keeps this column NULLABLE at the DB level. App enforces
--    "required" on the international code path so the cart errors
--    cleanly instead of the DB throwing. No DDL needed here; this
--    section documents the decision for migration archaeology.
-- ─────────────────────────────────────────────────────────────────
-- (no-op)
