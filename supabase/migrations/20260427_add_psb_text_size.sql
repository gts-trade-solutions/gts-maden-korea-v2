-- Add a text_size column to product_story_blocks so authors can choose
-- the typographic scale on every text-bearing tile (hero / feature /
-- image caption / stats headline / comparison caption). Default 'md'
-- preserves the look of every existing row.

alter table public.product_story_blocks
  add column if not exists text_size text default 'md'
  check (text_size in ('sm','md','lg','xl','2xl'));

-- Ensure existing rows have a value (covers any row created with NULL
-- before the default landed).
update public.product_story_blocks
  set text_size = 'md'
  where text_size is null;
