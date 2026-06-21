-- Per-influencer commission cap + default customer-discount split.
--
-- Replaces the hardcoded MAX_SPLIT=25 in app code with admin-managed
-- per-influencer settings, set during approval.
--
-- Storage:
--   commission_cap_pct       — total combined cap (customer% + influencer%).
--   default_user_discount_pct — admin-set default customer share for the
--                              influencer's "Recommended" button. The
--                              influencer-share default is just
--                              (cap - default_user_discount_pct).
--
-- Whole percent only (smallint). Floor 5 on the cap by request; the
-- discount has no independent floor — it just must not exceed the cap
-- (enforced in app code, not the DB).
--
-- Pre-existing rows backfilled to 30/15 (per user request). New
-- approvals must set these via the updated approve_influencer RPC.

alter table public.influencer_profiles
  add column if not exists commission_cap_pct       smallint,
  add column if not exists default_user_discount_pct smallint;

-- Backfill existing influencers before adding NOT NULL + CHECK.
update public.influencer_profiles
   set commission_cap_pct       = 30,
       default_user_discount_pct = 15
 where commission_cap_pct is null
    or default_user_discount_pct is null;

alter table public.influencer_profiles
  alter column commission_cap_pct        set not null,
  alter column default_user_discount_pct set not null;

alter table public.influencer_profiles
  add constraint influencer_profiles_cap_range_chk
    check (commission_cap_pct >= 5 and commission_cap_pct <= 100),
  add constraint influencer_profiles_default_discount_range_chk
    check (
      default_user_discount_pct >= 0
      and default_user_discount_pct <= commission_cap_pct
    );

comment on column public.influencer_profiles.commission_cap_pct is
  'Total cap (customer% + influencer%) on any promo this influencer can create. Floor 5, max 100. Admin-set at approval.';
comment on column public.influencer_profiles.default_user_discount_pct is
  'Admin-set default customer share for the influencer''s "Recommended" button. Must be 0..commission_cap_pct.';

-- Update approve_influencer to require the new params. The old
-- single-arg signature is dropped so client code can''t bypass setting
-- the cap — old callers fail loudly. The body is otherwise unchanged
-- from the prior production version, with the cap/discount params
-- threaded through to the new columns.
drop function if exists public.approve_influencer(uuid);

create or replace function public.approve_influencer(
  p_request_id              uuid,
  p_cap_pct                 smallint,
  p_default_discount_pct    smallint
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
  -- gate
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  -- validate cap + default split (DB CHECKs catch this too, but we
  -- want a friendly error message for the admin UI)
  if p_cap_pct is null or p_cap_pct < 5 or p_cap_pct > 100 then
    raise exception 'cap_pct must be between 5 and 100';
  end if;
  if p_default_discount_pct is null
     or p_default_discount_pct < 0
     or p_default_discount_pct > p_cap_pct then
    raise exception 'default_discount_pct must be between 0 and cap_pct';
  end if;

  -- mark request approved and capture user_id + requested handle
  update public.influencer_requests
     set status = 'approved'
   where id = p_request_id
   returning user_id, handle into v_uid, v_handle;

  if v_uid is null then
    raise exception 'request not found';
  end if;

  -- derive a handle if none/too short
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

    -- add short suffix to avoid collisions
    v_handle := v_handle || '_' || substr(replace(gen_random_uuid()::text,'-',''),1,4);
  end if;

  -- upsert influencer profile (per existing schema, with the two
  -- new admin-managed cap fields included). On re-approval we keep
  -- the previously set cap/default — admin can edit via the inline
  -- editor on /admin/influencers if they want to change it.
  insert into public.influencer_profiles(
    user_id, handle, display_name, avatar_url, social,
    default_commission_percent, active,
    commission_cap_pct, default_user_discount_pct,
    created_at, updated_at
  )
  values (
    v_uid, v_handle, null, null, '{}'::jsonb,
    10.00, true,
    p_cap_pct, p_default_discount_pct,
    now(), now()
  )
  on conflict (user_id) do update
     set handle     = excluded.handle,
         active     = true,
         updated_at = now();
end;
$function$;
