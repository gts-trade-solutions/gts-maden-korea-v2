// lib/mediaImageLoader.ts
//
// Custom loader for Next.js <Image>. All media lives in S3 and is served via
// CloudFront, so images are served directly rather than through /_next/image
// (admin uploads are full-resolution originals; round-tripping them through
// the Next optimizer on a cold cache cost seconds per image).
//
// Its one job now is host normalisation: many *_url columns still hold full
// Supabase Storage URLs from before the migration, and the S3 object lives at
// the same <bucket>/<key>, so those get rewritten to the CDN. Anything else
// (Instagram, unsplash, already-CDN URLs) passes through untouched.
//
// Usage:
//   <Image loader={mediaImageLoader} src={publicUrl} ... />

import { supabaseUrlToCdn } from "@/lib/storage/backend";


type LoaderArgs = {
  src: string;
  width: number;
  quality?: number;
};

export function mediaImageLoader({ src }: LoaderArgs): string {
  // All media is served from S3/CloudFront. There is no CDN image-transform
  // wired up yet, so the object is served directly — but stored values that are
  // still full Supabase Storage URLs (many *_url columns hold these) get their
  // host rewritten to the CDN, since the S3 object lives at the same
  // <bucket>/<key>. Non-storage URLs (Instagram, unsplash, ...) pass through.
  return supabaseUrlToCdn(src);
}

export default mediaImageLoader;
