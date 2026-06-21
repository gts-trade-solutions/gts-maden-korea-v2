-- Drop the (product_id, position) unique constraint on product_story_blocks.
-- Reorder operations need to swap positions, which Postgres evaluates row-by-row
-- as transient duplicates against this constraint. The compound index on
-- (product_id, position) (idx_psb_product_position) is sufficient for ordered
-- reads and is kept in place.
alter table public.product_story_blocks
  drop constraint if exists product_story_blocks_product_id_position_key;
