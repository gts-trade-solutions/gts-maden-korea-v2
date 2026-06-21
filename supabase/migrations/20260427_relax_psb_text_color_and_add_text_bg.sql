-- v2 colors: drop the strict 'light'/'dark' CHECK on text_color so the
-- column can store any CSS color string. The renderer treats the
-- legacy 'light'/'dark' enum keywords as themed defaults and any
-- other string as a CSS color (hex, rgb(), hsl(), named).

alter table public.product_story_blocks
  drop constraint if exists product_story_blocks_text_color_check;

-- Optional opaque background for text zones (caption strip, feature
-- Mode B text half, stats panel). Null = use the legacy tinted defaults.
alter table public.product_story_blocks
  add column if not exists text_bg text;
