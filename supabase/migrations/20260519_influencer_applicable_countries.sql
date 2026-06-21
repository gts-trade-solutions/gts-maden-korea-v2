-- Per-influencer region restriction. Empty array = applies in every
-- supported country (current behaviour). Non-empty = the promo only
-- applies when the buyer's `mik_country` cookie is in the list.
--
-- Admin-managed only — set at approval time via the updated
-- `approve_influencer` RPC and editable later from /admin/influencers.
-- The 27 existing influencers default to '{}' so nothing changes for
-- them until admin explicitly restricts their reach.

alter table public.influencer_profiles
  add column if not exists applicable_countries text[] not null default '{}'::text[];

comment on column public.influencer_profiles.applicable_countries is
  'ISO-3166-1 alpha-2 codes the influencer''s promo codes are valid in. Empty = active in all supported countries. Admin-managed via /admin/influencers.';

drop function if exists public.approve_influencer(uuid, smallint, smallint);

create or replace function public.approve_influencer(
  p_request_id              uuid,
  p_cap_pct                 smallint,
  p_default_discount_pct    smallint,
  p_applicable_countries    text[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid    uuid;
  v_handle text;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_cap_pct is null or p_cap_pct < 5 or p_cap_pct > 100 then
    raise exception 'cap_pct must be between 5 and 100';
  end if;
  if p_default_discount_pct is null
     or p_default_discount_pct < 0
     or p_default_discount_pct > p_cap_pct then
    raise exception 'default_discount_pct must be between 0 and cap_pct';
  end if;

  update public.influencer_requests
     set status = 'approved'
   where id = p_request_id
   returning user_id, handle into v_uid, v_handle;

  if v_uid is null then
    raise exception 'request not found';
  end if;

  if v_handle is null or length(v_handle) < 3 then
    select coalesce(
             nullif(public.slugify_handle(p.full_name), ''),
             nullif(split_part(u.email,'@',1), ''),
             'user'
           )
      into v_handle
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = v_uid;

    v_handle := v_handle || '_' || substr(replace(gen_random_uuid()::text,'-',''),1,4);
  end if;

  insert into public.influencer_profiles(
    user_id, handle, display_name, avatar_url, social,
    default_commission_percent, active,
    commission_cap_pct, default_user_discount_pct,
    applicable_countries,
    created_at, updated_at
  )
  values (
    v_uid, v_handle, null, null, '{}'::jsonb,
    10.00, true,
    p_cap_pct, p_default_discount_pct,
    coalesce(p_applicable_countries, '{}'::text[]),
    now(), now()
  )
  on conflict (user_id) do update
     set handle     = excluded.handle,
         active     = true,
         updated_at = now();
end;
$function$;
