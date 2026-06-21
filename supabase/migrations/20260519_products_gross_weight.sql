-- products.gross_weight_g — total weight including retail packaging
-- (bottle/box/label). Drives shipping math (India DTDC + international
-- EMS). Net weight stays as label/inventory metadata.
--
-- Backfill: copy net_weight_g into gross_weight_g for every row that
-- has a net weight. Shipping math then keeps working until admin
-- updates each row with the real packaged weight.

alter table public.products
  add column if not exists gross_weight_g numeric(8,2);

update public.products
   set gross_weight_g = net_weight_g
 where gross_weight_g is null
   and net_weight_g is not null
   and net_weight_g > 0;

comment on column public.products.gross_weight_g is
  'Total weight of the product with its retail packaging (g). Drives shipping math (India DTDC and international EMS). For inventory/labelling, see net_weight_g.';
