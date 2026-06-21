export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

/**
 * Invalidate Next.js caches after admin edits to product_story_blocks.
 * The public product page wraps both the block fetch and the page itself
 * in `unstable_cache` / `revalidate = 300`, so without this call deleted
 * blocks stay visible to customers for up to five minutes.
 */
export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const productId = String(body.productId || "").trim();
  if (!productId) return json({ ok: false, error: "MISSING_PRODUCT_ID" }, 400);

  // Tag invalidates the unstable_cache used by getStoryBlocksForProduct.
  revalidateTag("story-blocks");

  // Resolve the slug so we can drop the rendered HTML for that product page.
  const { data: prod } = await supabase
    .from("products")
    .select("slug")
    .eq("id", productId)
    .maybeSingle();
  const slug = prod?.slug as string | undefined;
  if (slug) revalidatePath(`/products/${slug}`);

  return json({ ok: true, slug: slug ?? null });
}
