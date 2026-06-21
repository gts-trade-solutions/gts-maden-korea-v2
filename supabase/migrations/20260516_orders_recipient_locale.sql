-- Snapshot the buyer's preferred locale at order creation so the
-- order confirmation email is sent in the language they were using
-- when they placed the order, even if their cookie/profile changes
-- afterwards.
--
-- Stays nullable for backward compatibility with existing rows;
-- senders fall back to 'en-IN' when null.
alter table public.orders
  add column if not exists recipient_locale text;

comment on column public.orders.recipient_locale is
  'Locale (next-intl code: en-IN, fr, de, etc.) snapshotted at order create. Drives the language of order confirmation + shipping emails. Null on legacy rows -> en-IN fallback.';
