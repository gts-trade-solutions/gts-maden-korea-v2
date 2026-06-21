-- C-04 + C-13 + C-14 scaffolding:
--   1. dtdc_shipments gains poller bookkeeping columns
--   2. pincode_serviceability_cache table for product / checkout pincode checks
--   3. dtdc_apply_status_to_order() helper used by the scheduled poller
--      to keep orders.status in sync with shipment events

alter table public.dtdc_shipments
  add column if not exists last_polled_at         timestamptz,
  add column if not exists status_last_changed_at timestamptz;

create index if not exists idx_dtdc_shipments_active_poll
  on public.dtdc_shipments (is_active, last_polled_at)
  where is_active = true and status not in ('delivered','cancelled','rto');

create table if not exists public.pincode_serviceability_cache (
  pincode          text primary key,
  serviceable      boolean not null,
  eta_days_min     integer,
  eta_days_max     integer,
  payload          jsonb,
  last_checked_at  timestamptz not null default now(),
  source           text not null default 'shipsy'
);

alter table public.pincode_serviceability_cache enable row level security;

drop policy if exists "public read pincode cache"  on public.pincode_serviceability_cache;
drop policy if exists "service write pincode cache" on public.pincode_serviceability_cache;

create policy "public read pincode cache"
  on public.pincode_serviceability_cache
  for select
  using (true);

create or replace function public.dtdc_apply_status_to_order(
  p_order_id  uuid,
  p_new_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
     set status = p_new_status,
         updated_at = now()
   where id = p_order_id
     and status not in ('delivered','returned','cancelled');
end;
$$;

revoke all on function public.dtdc_apply_status_to_order(uuid, text) from public;
grant execute on function public.dtdc_apply_status_to_order(uuid, text) to service_role;
