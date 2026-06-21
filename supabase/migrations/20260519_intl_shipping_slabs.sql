-- International shipping: switch from linear per-gram rates to
-- per-country weight slabs (Korea Post EMS basis).
--
-- The base costs stored here are the un-buffered INR equivalent of
-- the EMS charge for the given destination + weight bracket. A global
-- `intl_buffer_pct` on store_settings is applied at runtime to derive
-- the customer-facing fee. A global `intl_packaging_tare_pct` (also
-- on store_settings) inflates the cart's gross weight before slab
-- lookup, so heavier orders pick up a proportional packaging surcharge.
-- The hard `intl_max_shipping_weight_kg` cap blocks checkout above it.

alter table public.country_shipping_rates
  add column if not exists slab_500g_inr  numeric(10,2),
  add column if not exists slab_1kg_inr   numeric(10,2),
  add column if not exists slab_2kg_inr   numeric(10,2),
  add column if not exists slab_3kg_inr   numeric(10,2),
  add column if not exists slab_5kg_inr   numeric(10,2),
  add column if not exists slab_7kg_inr   numeric(10,2),
  add column if not exists slab_10kg_inr  numeric(10,2),
  add column if not exists slab_15kg_inr  numeric(10,2),
  add column if not exists slab_20kg_inr  numeric(10,2);

-- Seed all 14 supported destinations from the Korea EMS workbook
-- (base costs in INR, no buffer applied). Buffer + tare live on
-- store_settings.
with seed(country, s500, s1, s2, s3, s5, s7, s10, s15, s20) as (
  values
    ('US', 1921.92, 2446.08, 3407.04, 4368.00, 6289.92, 8299.20, 11182.08, 16074.24, 20966.40),
    ('GB', 2358.72, 2695.68, 3257.28, 3706.56, 4717.44, 5840.64,  7637.76, 10670.40, 13703.04),
    ('VN', 1223.04, 1397.76, 1659.84, 1834.56, 2271.36, 2708.16,  3494.40,  4892.16,  6202.56),
    ('FR', 1894.14, 2145.41, 2657.60, 3131.14, 4107.20, 5131.58,  7083.71, 10282.50, 13519.94),
    ('DE', 2222.72, 2541.63, 3160.13, 3672.32, 4725.70, 5808.06,  7673.22, 10717.38, 13800.19),
    ('ES', 2029.44, 2319.36, 2995.84, 3575.68, 4832.00, 6184.96,  8117.76, 11306.88, 14496.00),
    ('IT', 2009.28, 2271.36, 2795.52, 3232.32, 4280.64, 5416.32,  7338.24, 10570.56, 13802.88),
    ('PL', 2009.28, 2271.36, 2795.52, 3232.32, 4280.64, 5416.32,  7338.24, 10570.56, 13802.88),
    ('PT', 2009.28, 2271.36, 2795.52, 3232.32, 4280.64, 5416.32,  7338.24, 10570.56, 13802.88),
    ('QA', 2009.28, 2271.36, 2795.52, 3232.32, 4280.64, 5416.32,  7338.24, 10570.56, 13802.88),
    ('AE', 2009.28, 2271.36, 2795.52, 3232.32, 4280.64, 5416.32,  7338.24, 10570.56, 13802.88),
    ('ZA', 2367.46, 2795.52, 3660.38, 4446.62, 6630.62, 8814.62, 12073.15, 17480.74, 22923.26),
    ('TZ', 2367.46, 2795.52, 3660.38, 4446.62, 6630.62, 8814.62, 12073.15, 17480.74, 22923.26),
    ('NG', 2367.46, 2795.52, 3660.38, 4446.62, 6630.62, 8814.62, 12073.15, 17480.74, 22923.26)
)
update public.country_shipping_rates r
   set slab_500g_inr = s.s500,
       slab_1kg_inr  = s.s1,
       slab_2kg_inr  = s.s2,
       slab_3kg_inr  = s.s3,
       slab_5kg_inr  = s.s5,
       slab_7kg_inr  = s.s7,
       slab_10kg_inr = s.s10,
       slab_15kg_inr = s.s15,
       slab_20kg_inr = s.s20,
       updated_at = now()
  from seed s
 where r.country = s.country;

alter table public.country_shipping_rates
  alter column slab_500g_inr  set not null,
  alter column slab_1kg_inr   set not null,
  alter column slab_2kg_inr   set not null,
  alter column slab_3kg_inr   set not null,
  alter column slab_5kg_inr   set not null,
  alter column slab_7kg_inr   set not null,
  alter column slab_10kg_inr  set not null,
  alter column slab_15kg_inr  set not null,
  alter column slab_20kg_inr  set not null;

alter table public.country_shipping_rates
  drop column rate_per_gram_inr;

alter table public.store_settings
  add column if not exists intl_packaging_tare_pct      smallint not null default 15
    check (intl_packaging_tare_pct >= 0 and intl_packaging_tare_pct <= 100),
  add column if not exists intl_buffer_pct              smallint not null default 20
    check (intl_buffer_pct >= 0 and intl_buffer_pct <= 100),
  add column if not exists intl_max_shipping_weight_kg  smallint not null default 20
    check (intl_max_shipping_weight_kg between 1 and 100);

comment on column public.store_settings.intl_packaging_tare_pct is
  'Percentage uplift applied to the cart''s gross product weight before slab lookup. Covers outer/shipping packaging.';
comment on column public.store_settings.intl_buffer_pct is
  'Markup over EMS base cost applied at runtime to derive the customer-facing shipping fee. Covers FX swings + handling.';
comment on column public.store_settings.intl_max_shipping_weight_kg is
  'Hard cap (post-tare) above which checkout is blocked with a contact-us message. EMS workbook supports up to 20kg.';
