-- First-party analytics event log + per-user tracking-consent flag.
-- Powers /admin/analytics/funnel and /admin/analytics/sessions, plus
-- the funnel attribution stitching on signup/login. See ANALYTICS.md
-- for the full pipeline and event whitelist.
--
-- Applied live as `events_funnel` on 2026-05-02.

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  anon_id     text not null,
  session_id  text not null,
  event_name  text not null,
  path        text,
  referrer    text,
  user_agent  text,
  ip_prefix   text,
  utm         jsonb,
  device      jsonb,
  props       jsonb not null default '{}'::jsonb
);

create index if not exists events_occurred_at_idx on public.events (occurred_at desc);
create index if not exists events_user_time_idx   on public.events (user_id, occurred_at desc);
create index if not exists events_anon_time_idx   on public.events (anon_id, occurred_at desc);
create index if not exists events_name_time_idx   on public.events (event_name, occurred_at desc);
create index if not exists events_session_idx     on public.events (session_id);
create index if not exists events_props_product_idx
  on public.events ((props->>'product_id'))
  where props ? 'product_id';

alter table public.events enable row level security;

drop policy if exists "admin read events" on public.events;
create policy "admin read events"
  on public.events
  for select
  to authenticated
  using (public.is_admin());

-- Writes only via service-role (the API route bypasses RLS).
-- Customers cannot insert their own rows directly, eliminating one
-- vector for forged or spammed events.

-- Optional consent flag on profiles. Defaults to true; we expose an
-- opt-out toggle in account settings later. The track + identify
-- routes honor it.
alter table public.profiles
  add column if not exists tracking_consent boolean not null default true;
