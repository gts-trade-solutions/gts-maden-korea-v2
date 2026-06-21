-- v4: caption_mode controls when text on a tile is visible.
--   'always' — text rendered as today (default; preserves every existing row)
--   'hover'  — text overlay fades in only when the tile is hovered/focused
-- Renderer applies hover-mode only to text-on-image scenarios:
--   hero, feature Mode A, and image-with-caption. Other block types
--   silently ignore the column because their text *is* the content
--   (stats) or fundamentally beside the image (feature Mode B).

alter table public.product_story_blocks
  add column if not exists caption_mode text default 'always'
  check (caption_mode in ('always','hover'));

update public.product_story_blocks
  set caption_mode = 'always'
  where caption_mode is null;
