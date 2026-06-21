-- Make recalculate_cart_totals K-Plus-aware.
--
-- BEFORE: shipping was computed purely from subtotal vs threshold,
-- ignoring active K-Plus memberships. The UI's computeShippingFee()
-- (lib/membership.ts) DID consider membership and showed "Free
-- delivery" to K-Plus members in cart and checkout — but the SQL
-- function wrote the regular shipping_fee into the orders row, which
-- is what /api/razorpay/create then trusted when charging Razorpay.
-- Net effect: K-Plus members were charged shipping despite the UI
-- promising free delivery.
--
-- AFTER: the function looks up the cart owner's active membership
-- (status = 'active' AND ends_at > now()) and zeroes shipping when one
-- exists. Brings the SQL into agreement with the UI computation; both
-- now use a single source of truth (the user_memberships table).
--
-- Threshold + fee continue to come from store_settings — admin can
-- still adjust both for non-members.

CREATE OR REPLACE FUNCTION public.recalculate_cart_totals(p_cart_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
declare
  sub          numeric(12,2);
  ship         numeric(12,2);
  disc         numeric(12,2);
  tot          numeric(12,2);
  v_threshold  integer;
  v_fee        integer;
  v_user       uuid;
  v_has_kplus  boolean;
begin
  select coalesce(sum(line_total), 0) into sub
  from public.cart_items where cart_id = p_cart_id;

  -- Pull the live shipping config from store_settings (admin-controlled).
  -- Falls back to the historical defaults if the row is somehow missing.
  select delivery_threshold, default_shipping_fee
    into v_threshold, v_fee
    from public.store_settings
    where id = 1;
  if v_threshold is null then v_threshold := 2000; end if;
  if v_fee is null then v_fee := 149; end if;

  -- Look up the cart owner so we can check K-Plus membership. Carts
  -- are user-scoped (carts.user_id), so this is a single row.
  select user_id into v_user from public.carts where id = p_cart_id;

  v_has_kplus := false;
  if v_user is not null then
    select exists (
      select 1
      from public.user_memberships
      where user_id = v_user
        and status = 'active'
        and ends_at > now()
    ) into v_has_kplus;
  end if;

  -- K-Plus benefit overrides the threshold rule entirely.
  if v_has_kplus then
    ship := 0;
  else
    ship := case when sub < v_threshold then v_fee else 0 end;
  end if;

  select coalesce(discount_total, 0) into disc
    from public.carts where id = p_cart_id;
  tot := sub + ship - disc;

  update public.carts
  set subtotal = sub,
      shipping_fee_estimate = ship,
      total_estimate = greatest(0, tot),
      updated_at = now()
  where id = p_cart_id;
end;
$function$;
