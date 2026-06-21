-- product_story_blocks: bento-grid story blocks for the customer-facing
-- "Discover" section on each product detail page.

create table if not exists public.product_story_blocks (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  position        integer not null,
  block_type      text not null check (block_type in ('hero','feature','stats','comparison','image')),
  size            text not null default '2x1' check (size in ('1x1','2x1','1x2','2x2','4x1')),
  mode            text not null default 'A' check (mode in ('A','B','C')),
  headline        text,
  body            text,
  text_position   text default 'bottom-left'
                  check (text_position in (
                    'top-left','top-center','top-right',
                    'middle-left','middle-center','middle-right',
                    'bottom-left','bottom-center','bottom-right'
                  )),
  text_color      text default 'light' check (text_color in ('light','dark')),
  split_direction text default 'image-left'
                  check (split_direction in ('image-left','image-right','image-top','image-bottom')),
  image_path      text,
  image_alt       text,
  caption         text,
  stats_items     jsonb,
  before_image_path  text,
  after_image_path   text,
  comparison_caption text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (product_id, position)
);

create index if not exists idx_psb_product_position
  on public.product_story_blocks (product_id, position);

alter table public.product_story_blocks enable row level security;

drop policy if exists "psb public read"  on public.product_story_blocks;
drop policy if exists "psb admin all"    on public.product_story_blocks;
drop policy if exists "psb vendor own"   on public.product_story_blocks;

create policy "psb public read"
  on public.product_story_blocks
  for select
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_story_blocks.product_id
        and p.is_published = true
        and p.deleted_at is null
    )
  );

create policy "psb admin all"
  on public.product_story_blocks
  for all
  using (
    exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid() and pr.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid() and pr.role = 'admin'
    )
  );

create policy "psb vendor own"
  on public.product_story_blocks
  for all
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_story_blocks.product_id
        and p.vendor_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      where p.id = product_story_blocks.product_id
        and p.vendor_id = auth.uid()
    )
  );

create or replace function public.product_story_blocks_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_psb_set_updated_at on public.product_story_blocks;
create trigger trg_psb_set_updated_at
  before update on public.product_story_blocks
  for each row execute function public.product_story_blocks_set_updated_at();

insert into storage.buckets (id, name, public)
values ('product-story-media','product-story-media', true)
on conflict (id) do nothing;

drop policy if exists "public read product-story-media"  on storage.objects;
drop policy if exists "auth upload product-story-media"  on storage.objects;
drop policy if exists "auth update product-story-media"  on storage.objects;
drop policy if exists "auth delete product-story-media"  on storage.objects;

create policy "public read product-story-media"
  on storage.objects for select
  using (bucket_id = 'product-story-media');

create policy "auth upload product-story-media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-story-media');

create policy "auth update product-story-media"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-story-media');

create policy "auth delete product-story-media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-story-media');
