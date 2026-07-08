export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Admin product-video gallery read, MySQL-authoritative (Prisma). Backs the
// multi-video list in components/admin/ProductEditor.tsx. Mirrors the old
// browser Supabase select: id, storage_path, alt, sort_order for a product,
// ordered sort_order asc. Writes still flow through adminWrite.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const productId = new URL(req.url).searchParams.get("product_id");
  if (!productId) return json({ ok: false, error: "MISSING_PRODUCT_ID" }, 400);

  try {
    const videos = await prisma.product_videos.findMany({
      where: { product_id: productId },
      select: { id: true, storage_path: true, alt: true, sort_order: true },
      orderBy: { sort_order: "asc" },
    });
    return json({ ok: true, videos: jsonSafe(videos) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
