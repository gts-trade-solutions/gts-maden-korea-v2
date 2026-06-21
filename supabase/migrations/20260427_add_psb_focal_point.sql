-- Per-block image focal point (percentage 0-100). Null means use the
-- default 50/50 (center). Lets authors keep the subject in frame on
-- portrait tiles and on mobile crops without having to actually crop
-- the image file.
alter table public.product_story_blocks
  add column if not exists image_focal_x numeric
  check (image_focal_x is null or (image_focal_x >= 0 and image_focal_x <= 100));

alter table public.product_story_blocks
  add column if not exists image_focal_y numeric
  check (image_focal_y is null or (image_focal_y >= 0 and image_focal_y <= 100));
