-- K-Partnership critical bug-fix bundle (2026-05-18).
--
-- 1) Extend `order_attributions.status` to allow 'voided'.
--    Phase 2 introduced the 'voided' status (admin "Void" button +
--    refund trigger) but the existing CHECK constraint only permitted
--    pending/approved/rejected/paid, so every write of 'voided' was
--    silently rejected.
--
-- 2) `recalculate_order_totals` was unconditionally overwriting
--    `subtotal` / `shipping_fee` / `total` from order_items (INR
--    sum) + India-only shipping threshold logic. This fired on any
--    discount_total change (e.g. razorpay/verify writing the
--    influencer-discount line) and destroyed the buyer-currency view
--    razorpay/create had carefully written for international orders.
--    Fix: bail early when the order is non-INR — those orders are
--    fully managed by razorpay/create + verify in buyer currency
--    plus the *_inr snapshot columns.
--
-- 3) Add `display_currency` to `influencer_profiles` so each
--    influencer's dashboard can lock to a chosen currency
--    independently of the `mik_currency` cookie. The commission
--    ledger stays INR-canonical; this is display-only.

-- ── 1) Constraint fix ────────────────────────────────────────────
alter table public.order_attributions
  drop constraint if exists order_attributions_status_check;

alter table public.order_attributions
  add constraint order_attributions_status_check
  check (status = any (array[
    'pending'::text,
    'approved'::text,
    'rejected'::text,
    'paid'::text,
    'voided'::text
  ]));

-- ── 2) Recalc fix ────────────────────────────────────────────────
create or replace function public.recalculate_order_totals(p_order_id uuid)
returns void
language plpgsql
as $function$
declare
  sub          numeric(12,2);
  ship         numeric(12,2);
  disc         numeric(12,2);
  tot          numeric(12,2);
  v_threshold  integer;
  v_fee        integer;
  v_currency   text;
begin
  -- Skip non-INR orders entirely. Those are fully managed by the
  -- Razorpay create/verify flow which sets buyer-currency totals +
  -- INR snapshots. Re-deriving from order_items.line_total here
  -- would assume the line_total is in the order's currency, which
  -- it is not (it's INR — copied from cart_items at order creation).
  select currency into v_currency
  from public.orders
  where id = p_order_id;
  if v_currency is distinct from 'INR' then
    return;
  end if;

  select coalesce(sum(line_total), 0) into sub
  from public.order_items
  where order_id = p_order_id;

  select delivery_threshold, default_shipping_fee
    into v_threshold, v_fee
    from public.store_settings
    where id = 1;
  if v_threshold is null then v_threshold := 2000; end if;
  if v_fee is null then v_fee := 149; end if;

  ship := case when sub < v_threshold then v_fee else 0 end;

  select coalesce(discount_total, 0) into disc
  from public.orders
  where id = p_order_id;

  tot := sub + ship - disc;

  update public.orders
  set subtotal = sub,
      shipping_fee = ship,
      total = greatest(0, tot),
      updated_at = now()
  where id = p_order_id;
end;
$function$;

-- ── 3) display_currency on influencer_profiles ───────────────────
alter table public.influencer_profiles
  add column if not exists display_currency text not null default 'INR';

comment on column public.influencer_profiles.display_currency is
  'Locked dashboard display currency for the influencer. Source of truth for commissions stays INR; this only controls how amounts are rendered on /influencer/*. Editable by the influencer from their dashboard.';
