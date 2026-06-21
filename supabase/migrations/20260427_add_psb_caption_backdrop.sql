-- v8: per-block caption_backdrop. When true, the caption (or
-- headline/body for hero/feature) gets a small frosted backdrop right
-- behind the glyphs only — useful when an image is too busy for the
-- text-shadow alone to keep the text legible. Defaults to false to
-- preserve every existing row's visual treatment.
alter table public.product_story_blocks
  add column if not exists caption_backdrop boolean not null default false;
