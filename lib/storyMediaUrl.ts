import { publicURL } from "@/lib/storage-public-url";

const BUCKET = "product-story-media";

export function storyMediaUrl(
  path: string | null | undefined
): string | null {
  if (!path) return null;
  const cleaned = path.replace(/^product-story-media\//, "");
  return publicURL(BUCKET, cleaned) ?? null;
}

export const STORY_MEDIA_BUCKET = BUCKET;
