-- Make is_admin() recognise both the regular `admin` role and the
-- protected `super_admin` role.
--
-- This single function underpins 47+ RLS policies (products, vendors,
-- influencer_*, promo_codes, order_attributions, store_settings,
-- home_banners, etc.) plus the approve_influencer RPC's authorisation
-- gate plus several admin pages that call it via supabase.rpc.
-- Without this update, the super admin would be silently rejected by
-- every RLS check despite the app-level hasRole('admin') passing —
-- they'd appear "logged in" but see empty data on every admin page.
--
-- Signature unchanged so every existing caller works as-is.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$function$;
