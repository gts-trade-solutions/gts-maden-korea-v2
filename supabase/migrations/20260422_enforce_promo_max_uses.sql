drop function if exists public.get_promo_details(text);
drop function if exists public.validate_promo(text);
drop function if exists public.increment_promo_use(uuid);

create or replace function public.get_promo_details(p_code text)
returns table (
  id uuid,
  code text,
  influencer_id uuid,
  product_id uuid,
  scope text,
  discount_percent numeric,
  user_discount_percent numeric,
  commission_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.code,
    p.influencer_id,
    p.product_id,
    case when p.product_id is null then 'global' else 'product' end as scope,
    p.discount_percent,
    p.discount_percent as user_discount_percent,
    p.commission_percent
  from public.promo_codes p
  where upper(trim(p.code)) = upper(trim(p_code))
    and coalesce(p.active, false) = true
    and (p.starts_at is null or p.starts_at <= now())
    and (p.expires_at is null or p.expires_at >= now())
    and (p.max_uses is null or coalesce(p.uses, 0) < p.max_uses)
  limit 1;
$$;

create or replace function public.validate_promo(p_code text)
returns table (
  id uuid,
  code text,
  influencer_id uuid,
  product_id uuid,
  discount_percent numeric,
  commission_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.code,
    p.influencer_id,
    p.product_id,
    p.discount_percent,
    p.commission_percent
  from public.promo_codes p
  where upper(trim(p.code)) = upper(trim(p_code))
    and coalesce(p.active, false) = true
    and (p.starts_at is null or p.starts_at <= now())
    and (p.expires_at is null or p.expires_at >= now())
    and (p.max_uses is null or coalesce(p.uses, 0) < p.max_uses)
  limit 1;
$$;

create or replace function public.increment_promo_use(p_promo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.promo_codes
  set uses = coalesce(uses, 0) + 1
  where id = p_promo_id
    and coalesce(active, false) = true
    and (max_uses is null or coalesce(uses, 0) < max_uses);

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;
