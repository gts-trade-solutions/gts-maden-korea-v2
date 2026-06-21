-- C-41 fix: drop the always-true ALL policies on home content tables
-- so non-admin authenticated users can no longer mutate banners /
-- product videos / influencer videos. Public storefront reads continue
-- to work via the existing "public read live X" policies (active +
-- within time window) and the SECURITY DEFINER *_live views.

drop policy if exists "auth manage banners"           on public.home_banners;
drop policy if exists "auth manage hpv"               on public.home_product_videos;
drop policy if exists "auth manage influencer videos" on public.home_influencer_videos;

create policy "admin manage banners"
  on public.home_banners
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin manage product videos"
  on public.home_product_videos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin manage influencer videos"
  on public.home_influencer_videos
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
