// Media URL resolver — the single source of truth for turning a stored media
// path/URL into a public URL. All media is served from S3/CloudFront.
//
// Historic DB values are mixed: bare keys, "<bucket>/<key>", and full Supabase
// Storage URLs from before the migration. The markers below let us recognise
// those legacy URLs and re-point them at the CDN — the S3 object lives at the
// same "<bucket>/<key>", so it is a pure host rewrite with no DB migration.
//
// Pure + isomorphic (no SDK) so it runs in client and server components alike.

const SUPABASE_MARKER = "/storage/v1/object/public/";
// Supabase's image-transform endpoint uses a different prefix but the same
// `<bucket>/<key>` shape after it.
const SUPABASE_RENDER_MARKER = "/storage/v1/render/image/public/";

// Retained so existing imports keep compiling; S3 is the only backend now.
export type StorageBackend = "s3";
export const STORAGE_BACKEND: StorageBackend = "s3";

// S3/CloudFront base (no trailing slash needed), e.g.
// https://madenkorea-media.s3.ap-south-1.amazonaws.com  or a CloudFront domain.
const MEDIA_CDN_URL = (process.env.NEXT_PUBLIC_MEDIA_CDN_URL || "").replace(/\/+$/, "");

/**
 * Bucket-agnostic rewrite of a full Supabase Storage URL (object OR render
 * endpoint) to the active backend's URL. Under S3 this maps
 *   https://<proj>.supabase.co/storage/v1/object/public/<bucket>/<key>
 *   https://<proj>.supabase.co/storage/v1/render/image/public/<bucket>/<key>?...
 * to `${CDN}/<bucket>/<key>` (the S3 objects live at the same `<bucket>/<key>`).
 * Anything that isn't one of our Supabase Storage URLs is returned unchanged, so
 * external URLs (Instagram/OAuth avatars) and already-CDN URLs pass through.
 * Under the Supabase backend it's a no-op. Used by the <Image> loader and any
 * code path that renders a stored full URL directly.
 */
export function supabaseUrlToCdn(url: string): string {
  if (!MEDIA_CDN_URL || !url) return url;
  for (const marker of [SUPABASE_MARKER, SUPABASE_RENDER_MARKER]) {
    const idx = url.indexOf(marker);
    if (idx >= 0) {
      let suffix = url.slice(idx + marker.length); // "<bucket>/<key>[?transform]"
      const q = suffix.indexOf("?");
      if (q >= 0) suffix = suffix.slice(0, q); // drop Supabase render params
      return `${MEDIA_CDN_URL}/${suffix}`;
    }
  }
  return url;
}

/**
 * Recover the bare object key (no host, no bucket prefix) from any stored value:
 * a relative key, a bucket-prefixed key, or a full Supabase public URL.
 */
export function normalizeKey(bucket: string, rawPath: string): string {
  let v = rawPath.trim();
  const idx = v.indexOf(SUPABASE_MARKER);
  if (idx >= 0) {
    // ".../public/<bucket>/<key>" -> strip the marker and the first (bucket) segment
    const suffix = v.slice(idx + SUPABASE_MARKER.length);
    const firstSlash = suffix.indexOf("/");
    v = firstSlash >= 0 ? suffix.slice(firstSlash + 1) : suffix;
  }
  // strip leading slashes + a leading "<bucket>/" prefix if present
  v = v.replace(/^\/+/, "");
  if (v.startsWith(`${bucket}/`)) v = v.slice(bucket.length + 1);
  return v;
}

/**
 * Resolve a stored media path/URL to a public URL under the active backend.
 * - Falsy -> undefined.
 * - External absolute URL (NOT our Supabase storage host) -> passed through
 *   unchanged (Instagram/Facebook media, OAuth avatar pictures, etc.).
 * - Our storage (relative key OR a legacy Supabase public URL) -> resolved to
 *   `${CDN}/<bucket>/<key>`.
 */
export function resolveMediaUrl(bucket: string, rawPath?: string | null): string | undefined {
  if (!rawPath) return undefined;
  const trimmed = rawPath.trim();
  if (!trimmed) return undefined;

  const isOurStorage = trimmed.includes(SUPABASE_MARKER);
  // External absolute URL (not our storage) -> leave as-is.
  if (!isOurStorage && /^https?:\/\//i.test(trimmed)) return trimmed;

  const key = normalizeKey(bucket, trimmed);
  if (!key) return undefined;

  return MEDIA_CDN_URL ? `${MEDIA_CDN_URL}/${bucket}/${key}` : undefined;
}
