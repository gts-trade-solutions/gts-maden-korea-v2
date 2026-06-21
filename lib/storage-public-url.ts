import { resolveMediaUrl } from "@/lib/storage/backend";

// Shared public-URL builder. Now backend-aware (Supabase | S3) via
// resolveMediaUrl — same signature, so every existing caller switches backends
// automatically. The tolerant normalizer (legacy full URLs / bucket-prefixed
// keys) lives in lib/storage/backend.ts.
export function publicURL(bucket: string, path?: string | null) {
  return resolveMediaUrl(bucket, path);
}
