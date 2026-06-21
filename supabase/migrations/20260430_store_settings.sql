-- Single-row settings table for storefront-wide knobs the admin can edit.
-- Today: shipping threshold + default shipping fee. Public read because
-- the storefront already shows these values (e.g. "Free delivery above
-- ₹2000"); admin-only write enforced via RLS.

create table if not exists public.store_settings (
  id                   smallint primary key default 1 check (id = 1),
  delivery_threshold   integer not null default 2000,
  default_shipping_fee integer not null default 149,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id)
);

insert into public.store_settings (id) values (1)
  on conflict (id) do nothing;

alter table public.store_settings enable row level security;

drop policy if exists "public read store settings"   on public.store_settings;
drop policy if exists "admin update store settings"  on public.store_settings;
drop policy if exists "admin insert store settings"  on public.store_settings;

create policy "public read store settings"
  on public.store_settings
  for select
  to anon, authenticated
  using (true);

create policy "admin update store settings"
  on public.store_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Insert is normally unnecessary (the seed row above covers it), but
-- include the policy for completeness so the singleton can be recreated
-- by an admin if it's ever deleted.
create policy "admin insert store settings"
  on public.store_settings
  for insert
  to authenticated
  with check (public.is_admin() and id = 1);
