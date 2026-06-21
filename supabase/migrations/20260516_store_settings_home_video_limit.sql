-- Admin-configurable cap for the home page product-video carousel.
-- Was hardcoded at 16 in app/page.tsx; surfacing it so admins don't
-- need a deploy when the catalog grows past the cap.
--
-- Defaults to 16 to preserve current behaviour. Range is enforced at
-- the API layer (1..50); the column itself stays unconstrained so
-- legacy rows backfill cleanly.

alter table public.store_settings
  add column if not exists home_video_limit integer not null default 16;

comment on column public.store_settings.home_video_limit is
  'Maximum number of product videos rendered on the home page carousel. Edited from /admin/cms/product-video. Hard upper bound (50) enforced in the admin API.';
