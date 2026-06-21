// lib/supabaseImageLoader.ts
//
// Custom loader for Next.js <Image> that routes Supabase-storage URLs
// through Supabase's image transformation endpoint instead of through
// `/_next/image`.
//
// Why this exists:
//   Admin uploads product photos at original camera resolution
//   (1.5 MB average, some 10+ MB). When Next.js Image optimizes them
//   it has to fetch the FULL original from Supabase first, then
//   transcode. On a cold cache that's a 3-10+ second round trip per
//   image.
//
//   Supabase's transformation endpoint (Pro plan feature) does the
//   resize at the edge and caches it on their CDN. First-visit cost
//   drops to "one edge resize + cache write" and subsequent visits
//   are pure cache reads — same physical CDN that already serves the
//   bucket.
//
// Usage:
//   <Image loader={supabaseImageLoader} src={publicUrl} ... />
//
// Non-Supabase URLs (e.g., unsplash banners) pass through unchanged.

import { STORAGE_BACKEND } from "@/lib/storage/backend";

const SUPABASE_OBJECT_PATH = "/storage/v1/object/public/";
const SUPABASE_RENDER_PATH = "/storage/v1/render/image/public/";

type LoaderArgs = {
  src: string;
  width: number;
  quality?: number;
};

export function supabaseImageLoader({ src, width, quality }: LoaderArgs): string {
  // S3 backend: there is no Supabase render/image transform equivalent, so serve
  // the object directly (no rewrite). Revisit with a CloudFront image-transform.
  if (STORAGE_BACKEND === "s3") {
    return src;
  }

  // Only rewrite Supabase storage URLs. Anything else (unsplash hero
  // banners, etc.) gets returned untouched so Next.js falls back to
  // its default behavior.
  if (!src.includes(SUPABASE_OBJECT_PATH)) {
    return src;
  }

  // The render endpoint takes the same `<bucket>/<path>` shape as the
  // object endpoint — just a different prefix. Preserve everything
  // after the prefix verbatim.
  const transformed = src.replace(SUPABASE_OBJECT_PATH, SUPABASE_RENDER_PATH);

  // Clamp width to Supabase's documented maximum (2500). Asking for
  // a larger value returns a 400.
  const w = Math.min(Math.max(1, Math.round(width)), 2500);
  const q = Math.min(Math.max(20, Math.round(quality ?? 75)), 100);

  // `resize=contain` is critical here. Supabase's default mode is
  // `cover`, which tries to crop the image to fill a target box —
  // with only width supplied (no height), it ends up cropping every
  // image and presenting as a visible "zoom in" effect across the
  // storefront. `contain` keeps the original aspect ratio and just
  // scales the image to the requested width; CSS object-cover /
  // object-contain on the rendering component then handles the
  // container-fit cropping at the browser, matching how Next.js
  // Image's default pipeline behaved before this loader existed.
  const params = new URLSearchParams({
    width: String(w),
    quality: String(q),
    resize: "contain",
  });
  return `${transformed}?${params.toString()}`;
}

export default supabaseImageLoader;
