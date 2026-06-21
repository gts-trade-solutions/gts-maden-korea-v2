-- Commission auto-approval rule for K-Partnership.
-- `commission_auto_approve_days` controls how long after `paid_at` a
-- commission row stays in 'pending' before it becomes 'approved' and
-- available for withdrawal. 0 = approve immediately on order paid;
-- typical industry value is 14 days (covers the return window).
--
-- Phase 1 ships with default = 0 (immediate). Phase 2 adds the cron
-- that reads this setting and flips pending → approved when the
-- timestamp condition is met. Admin can raise the value any time;
-- already-approved rows stay approved.

alter table public.store_settings
  add column if not exists commission_auto_approve_days integer not null default 0;

comment on column public.store_settings.commission_auto_approve_days is
  'Days after order paid_at before a K-Partnership commission row auto-approves and becomes withdrawable. 0 = approve immediately on payment verification. Daily cron at /api/cron/commission-approve flips pending → approved when this window has elapsed.';
