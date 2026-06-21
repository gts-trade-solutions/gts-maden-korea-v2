-- Delivery ETA columns on country_shipping_rates.
-- Surfaced on cart + checkout for non-IN buyers so they see a
-- delivery estimate alongside the shipping fee. Range (min..max) days,
-- mirroring the existing shipping_zones table that India already uses.

alter table public.country_shipping_rates
  add column if not exists eta_days_min integer,
  add column if not exists eta_days_max integer;

comment on column public.country_shipping_rates.eta_days_min is
  'Lower bound of the delivery estimate in days from order placement. Optional; if null the storefront shows no ETA for this country.';
comment on column public.country_shipping_rates.eta_days_max is
  'Upper bound of the delivery estimate in days from order placement. Optional. Should be >= eta_days_min when both are set; the admin UI enforces that.';
