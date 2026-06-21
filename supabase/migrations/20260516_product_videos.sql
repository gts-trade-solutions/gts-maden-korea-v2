-- Allow multiple videos per product, mirroring the existing
-- product_images table shape. Legacy `products.video_path` stays in
-- place (one release of dual-write fallback); the storefront prefers
-- product_videos rows when present.
--
-- Storage paths point at the same `product-media` bucket the
-- products + images already use; admin uploads land under
-- `<sku>/video/<filename>`, same convention as today's single-video
-- flow.

create table if not exists public.product_videos (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  storage_path    text not null,
  thumbnail_path  text,
  alt             text,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  constraint product_videos_storage_path_uniq unique (product_id, storage_path)
);

comment on table  public.product_videos is
  'Multiple videos per product. Mirrors product_images shape; storage_path is bucket-relative within product-media.';
comment on column public.product_videos.thumbnail_path is
  'Optional poster image shown before play. Same bucket as the video.';

create index if not exists product_videos_product_id_sort_idx
  on public.product_videos(product_id, sort_order);

alter table public.product_videos enable row level security;

drop policy if exists product_videos_select_public on public.product_videos;
create policy product_videos_select_public
  on public.product_videos for select using (true);

-- Backfill: copy each non-null products.video_path into a row here so
-- existing products with a single video keep working under the new
-- table. Existing storefront code that reads `products.video_path`
-- continues to work as a fallback during the transition.
insert into public.product_videos (product_id, storage_path, sort_order)
select id, video_path, 0
from public.products
where video_path is not null
  and not exists (
    select 1 from public.product_videos pv
    where pv.product_id = products.id
      and pv.storage_path = products.video_path
  );
