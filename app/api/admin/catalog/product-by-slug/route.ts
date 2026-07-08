export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";

// Admin exact-slug → product-id lookup, MySQL-authoritative (Prisma). Backs
// the legacy single-product slug field in
// app/admin/cms/product-video/page.tsx. Mirrors the old browser Supabase
// `products.select('id').eq('slug', slug).single()`. Returns { ok, id }.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const slug = (new URL(req.url).searchParams.get("slug") || "").trim();
  if (!slug) return json({ ok: false, error: "MISSING_SLUG" }, 400);

  try {
    const product = await prisma.products.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!product) return json({ ok: false, error: "NOT_FOUND" }, 404);
    return json({ ok: true, id: product.id });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
