-- K-Partnership refund safety. When an order goes to 'cancelled' or
-- 'failed', void any matching commission attribution so the influencer
-- isn't paid for a sale that didn't actually stick. Idempotent — only
-- flips rows that aren't already voided.
--
-- 'voided' is a new logical status for `order_attributions`; the table
-- has no CHECK constraint on `status` so we can use it freely. The
-- dashboard summary + payout-availability math already filter on
-- status='approved' so voided rows fall out of all calculations.

create or replace function public.void_order_attribution_on_cancel()
returns trigger
language plpgsql
as $$
begin
  if (new.status = 'cancelled' or new.status = 'failed')
     and (old.status is distinct from new.status)
  then
    update public.order_attributions
       set status = 'voided'
     where order_id = new.id
       and status <> 'voided';
  end if;
  return new;
end;
$$;

comment on function public.void_order_attribution_on_cancel() is
  'Triggered on orders AFTER UPDATE. Voids any matching K-Partnership commission row when the order moves to cancelled/failed, so the influencer is not paid for a transaction that ultimately did not stick.';

drop trigger if exists order_void_attribution on public.orders;
create trigger order_void_attribution
  after update of status on public.orders
  for each row execute function public.void_order_attribution_on_cancel();
