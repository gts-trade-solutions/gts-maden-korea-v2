-- Companion to 20260430_recalculate_cart_totals_uses_store_settings.sql.
-- recalculate_order_totals fires from the order_items AIUD trigger and
-- previously stamped every order with the hardcoded 2000/149 rule,
-- undoing what create_order_from_cart wrote at insert time. Pull the
-- same live values from public.store_settings so admin edits in
-- /admin/settings → Shipping flow all the way through to the persisted
-- orders.shipping_fee and orders.total.

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
begin
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
