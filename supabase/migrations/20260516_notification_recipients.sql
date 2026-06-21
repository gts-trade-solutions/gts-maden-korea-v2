-- Admin-editable list of recipients for internal/admin notifications.
-- Replaces hardcoded ADMIN_EMAILS in razorpay/verify and the
-- "operations@..." CC sprinkled across contact/payouts/intl-order routes.
--
-- Single flat list (all admins get all notification kinds). If we ever
-- need per-kind routing (e.g. payouts go to finance only), we'd add
-- a `kinds text[]` column later — schema is forward-compatible.

create table if not exists public.notification_recipients (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  label       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint notification_recipients_email_unique unique (email)
);

comment on table public.notification_recipients is
  'Email addresses that receive admin/internal notifications (order placed, payout request, intl order request, contact form submission). Editable from /admin/settings/notification-emails.';

create index if not exists notification_recipients_active_idx
  on public.notification_recipients(active)
  where active = true;

-- updated_at touch trigger (same pattern as country_shipping_rates)
create or replace function public.notification_recipients_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notification_recipients_touch_updated_at on public.notification_recipients;
create trigger notification_recipients_touch_updated_at
  before update on public.notification_recipients
  for each row execute function public.notification_recipients_touch_updated_at();

-- RLS: read public (the email-sending API routes use anon-client
-- reads; not sensitive — these are work addresses). Writes service
-- role only, gated by the admin API.
alter table public.notification_recipients enable row level security;

drop policy if exists notification_recipients_select_public on public.notification_recipients;
create policy notification_recipients_select_public
  on public.notification_recipients
  for select using (true);

-- Seed with the 3 hardcoded addresses currently in razorpay/verify
-- so the cutover doesn't drop any existing notification destinations.
insert into public.notification_recipients (email, label)
values
  ('kh@raceinnovations.in',      'Founder / KH'),
  ('operations@madenkorea.com',  'Operations inbox'),
  ('arunpandian972000@gmail.com','Dev (personal)')
on conflict (email) do nothing;
