export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const TABLE_FOR_KIND: Record<string, string> = {
  product: "home_product_video_products",
  influencer: "home_influencer_video_products",
};

// Read the products attached to a video (MySQL/Prisma), ordered by position.
// Backs the admin editors' loadAttached() — returns the compact PickerProduct
// shape { id, slug, name, hero_image_path } the pickers expect.
//   GET /api/admin/video-products?kind=influencer&videoId=<uuid>
export async function GET(req: Request) {
  const { error: authErr } = await requireAdmin(req);
  if (authErr) return authErr;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "";
  const videoId = url.searchParams.get("videoId") || "";

  const table = TABLE_FOR_KIND[kind];
  if (!table) return json({ ok: false, error: "INVALID_KIND" }, 400);
  if (!videoId) return json({ ok: false, error: "INVALID_VIDEO_ID" }, 400);

  const model = (prisma as any)[table];
  try {
    const rows = await model.findMany({
      where: { video_id: videoId },
      select: {
        position: true,
        products: {
          select: { id: true, slug: true, name: true, hero_image_path: true },
        },
      },
      orderBy: { position: "asc" },
    });
    const products = (rows ?? [])
      .map((r: any) => r.products)
      .filter((p: any) => !!p);
    return json({ ok: true, products });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}

// Replace-all into the chosen video-products join table (MySQL/Prisma). The
// home page reads which products are attached to each video from MySQL. The
// route's own admin auth check is the gate.
export async function POST(req: Request) {
  const { error: authErr } = await requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const { kind, videoId, productIds } = body ?? {};

  const table = TABLE_FOR_KIND[kind];
  if (!table) return json({ ok: false, error: "INVALID_KIND" }, 400);
  if (typeof videoId !== "string" || !videoId)
    return json({ ok: false, error: "INVALID_VIDEO_ID" }, 400);
  if (!Array.isArray(productIds))
    return json({ ok: false, error: "INVALID_PRODUCT_IDS" }, 400);

  // Ordered, deduped set (defensive) — composite PK is (video_id, product_id),
  // no id column to generate.
  const seen = new Set<string>();
  const rows = productIds
    .filter((id: unknown): id is string => typeof id === "string" && !!id)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((product_id, position) => ({ video_id: videoId, product_id, position }));

  const model = (prisma as any)[table];
  try {
    if (rows.length === 0) {
      // Clear all rows for this video.
      await model.deleteMany({ where: { video_id: videoId } });
      return json({ ok: true, count: 0 });
    }

    // Replace-all, transactional: drop this video's rows then insert the new set.
    await prisma.$transaction([
      model.deleteMany({ where: { video_id: videoId } }),
      model.createMany({ data: rows }),
    ]);

    return json({ ok: true, count: rows.length });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WRITE_FAILED" }, 500);
  }
}
