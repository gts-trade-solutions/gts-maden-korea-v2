export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Admin product-story-block list read, MySQL-authoritative (Prisma). Mirrors
// the old browser Supabase select in components/admin/ProductStoryEditor.tsx:
// filter product_id (?product_id=), ordered position asc. Writes/revalidate
// keep their own endpoints (adminWrite + /story-blocks/revalidate).
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const productId = new URL(req.url).searchParams.get("product_id");
  if (!productId) return json({ ok: false, error: "MISSING_PRODUCT_ID" }, 400);

  try {
    const blocks = await prisma.product_story_blocks.findMany({
      where: { product_id: productId },
      select: {
        id: true,
        product_id: true,
        position: true,
        block_type: true,
        size: true,
        mode: true,
        headline: true,
        body: true,
        text_position: true,
        text_color: true,
        text_bg: true,
        text_size: true,
        text_weight: true,
        caption_mode: true,
        caption_backdrop: true,
        split_direction: true,
        image_path: true,
        image_alt: true,
        image_focal_x: true,
        image_focal_y: true,
        image_fit: true,
        image_zoom: true,
        image_bg: true,
        caption: true,
        stats_items: true,
        before_image_path: true,
        after_image_path: true,
        comparison_caption: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { position: "asc" },
    });
    return json({ ok: true, blocks: jsonSafe(blocks) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
