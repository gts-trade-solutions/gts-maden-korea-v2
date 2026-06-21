-- The cart-side total estimate (and therefore the order's persisted
-- shipping_fee + total when create_order_from_cart copies cart values)
-- previously hard-coded the shipping rule. Pull the live values from
-- public.store_settings so admin edits in /admin/settings → Shipping
-- propagate all the way through to the actual amount charged on
-- Razorpay and recorded against the order.

create or replace function public.recalculate_cart_totals(p_cart_id uuid)
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

  ship := case when sub < v_threshold then v_fee else 0 end;
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
