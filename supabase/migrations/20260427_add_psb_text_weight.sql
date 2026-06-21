-- v9: text_weight controls the boldness of overlay text (headline +
-- stats values). Default 'bold' preserves every existing row's look.
alter table public.product_story_blocks
  add column if not exists text_weight text default 'bold'
  check (text_weight in ('light','normal','medium','semibold','bold','extrabold'));

update public.product_story_blocks
  set text_weight = 'bold'
  where text_weight is null;
