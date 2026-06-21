-- v3: image fit mode + zoom + per-tile image background.
-- - image_fit controls how the image fills the tile (cover/contain/fill/original).
-- - image_zoom amplifies cover crops (1.0–3.0), centered on the focal point.
-- - image_bg fills the empty area when fit ≠ cover. Null = transparent.

alter table public.product_story_blocks
  add column if not exists image_fit text default 'cover'
  check (image_fit in ('cover','contain','fill','original'));

alter table public.product_story_blocks
  add column if not exists image_zoom numeric default 1
  check (image_zoom is null or (image_zoom >= 1 and image_zoom <= 3));

alter table public.product_story_blocks
  add column if not exists image_bg text;

update public.product_story_blocks
  set image_fit = 'cover'
  where image_fit is null;
