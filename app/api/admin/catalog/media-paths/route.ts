export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

// GET /api/admin/catalog/media-paths?table=product_images|product_videos&ids=a,b,c
// Returns the storage_path for a set of media rows so the editor can purge the
// underlying S3 blobs BEFORE deleting the rows. Read-only, admin-gated.
const TABLES = new Set(["product_images", "product_videos"]);

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table") || "";
  const ids = (searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!TABLES.has(table)) return json({ ok: false, error: "BAD_TABLE" }, 400);
  if (!ids.length) return json({ ok: true, paths: [] });

  const rows = await (prisma as any)[table].findMany({
    where: { id: { in: ids } },
    select: { storage_path: true },
  });
  const paths = rows.map((r: any) => r.storage_path).filter(Boolean);
  return json({ ok: true, paths });
}
