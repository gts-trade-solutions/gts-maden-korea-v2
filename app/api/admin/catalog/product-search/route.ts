export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Admin product search read, MySQL-authoritative (Prisma). Backs
// components/admin/ProductMultiPicker.tsx (search by name OR slug). Mirrors
// the old browser Supabase select: id, slug, name, hero_image_path; matches
// name/slug contains ?q= (min 2 chars), optional ?publishedOnly=1 filter,
// ordered name asc, limit 15.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const publishedOnly = url.searchParams.get("publishedOnly") === "1";
  if (q.length < 2) return json({ ok: true, products: [] });

  try {
    const products = await prisma.products.findMany({
      where: {
        ...(publishedOnly ? { is_published: true } : {}),
        OR: [{ name: { contains: q } }, { slug: { contains: q } }],
      },
      select: { id: true, slug: true, name: true, hero_image_path: true },
      orderBy: { name: "asc" },
      take: 15,
    });
    return json({ ok: true, products: jsonSafe(products) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
