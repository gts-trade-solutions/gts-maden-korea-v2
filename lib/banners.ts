// lib/banners.ts
import { resolveMediaUrl } from '@/lib/storage/backend';
import type { Banner } from '@/types/banner';

export type BannerRow = {
  id: string;
  alt: string;
  image_path: string | null;
  video_url: string | null;
  link_url: string | null;
  position: number;
  page_scope: string;
  active: boolean;
};

export function toPublicUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  return resolveMediaUrl('site-assets', path);
}

export function rowToBanner(row: BannerRow): Banner {
  return {
    id: row.id,
    alt: row.alt,
    image: toPublicUrl(row.image_path),
    video_url: row.video_url ?? undefined,
    link_url: row.link_url ?? undefined,
    position: row.position,
    page_scope: row.page_scope,
    active: row.active,
  };
}
