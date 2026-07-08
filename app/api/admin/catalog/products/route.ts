export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Admin product list CRUD, MySQL-authoritative (Prisma) read + write.
//   GET  -> products + brand/category/vendor lookups from MySQL.
//   POST -> { op, id?, ids?, data? } mutations written directly to MySQL.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  try {
    // Single product (full row) for the admin editor. Read from MySQL so HIDDEN
    // (is_published=false) products load too — the browser anon Supabase client
    // is RLS-blocked for unpublished rows under NextAuth (false "Product not found").
    if (id) {
      const [product, sImages, sBrands, sCategories] = await Promise.all([
        prisma.products.findUnique({ where: { id } }),
        prisma.product_images.findMany({ where: { product_id: id }, select: { id: true, storage_path: true, alt: true, sort_order: true }, orderBy: { sort_order: "asc" } }),
        prisma.brands.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
        prisma.categories.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
      ]);
      if (!product) return json({ ok: false, error: "NOT_FOUND" }, 404);
      const vendor = product.vendor_id
        ? await prisma.vendors.findUnique({ where: { id: product.vendor_id }, select: { id: true, display_name: true } })
        : null;
      return json({ ok: true, product: jsonSafe(product), images: jsonSafe(sImages), brands: jsonSafe(sBrands), categories: jsonSafe(sCategories), vendor: jsonSafe(vendor) });
    }
    const [products, brands, categories, vendors] = await Promise.all([
      prisma.products.findMany({
        select: {
          id: true, slug: true, name: true, sku: true, price: true, currency: true,
          is_published: true, stock_qty: true, brand_id: true, category_id: true,
          vendor_id: true, is_featured: true, featured_rank: true, is_trending: true, new_until: true,
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.brands.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
      prisma.categories.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
      prisma.vendors.findMany({ select: { id: true, display_name: true }, orderBy: { display_name: "asc" } }),
    ]);
    return json({ ok: true, products: jsonSafe(products), brands: jsonSafe(brands), categories: jsonSafe(categories), vendors: jsonSafe(vendors) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const body = await req.json().catch(() => ({} as any));
  const op = String(body?.op || "");

  try {
    if (op === "updateFields") {
      const id = String(body?.id || "");
      const data = body?.data ?? {};
      if (!id) return json({ ok: false, error: "MISSING_ID" }, 400);
      const patch: Record<string, any> = {};
      if ("is_featured" in data) patch.is_featured = !!data.is_featured;
      if ("featured_rank" in data)
        patch.featured_rank = data.featured_rank == null || data.featured_rank === "" ? null : Number(data.featured_rank);
      if ("is_trending" in data) patch.is_trending = !!data.is_trending;
      if ("new_until" in data) patch.new_until = data.new_until ? new Date(data.new_until) : null;
      // updateMany = silent no-op if the id is missing (matches old Supabase behavior).
      await prisma.products.updateMany({ where: { id }, data: patch });
      return json({ ok: true });
    }

    if (op === "delete") {
      const id = String(body?.id || "");
      if (!id) return json({ ok: false, error: "MISSING_ID" }, 400);
      // Explicitly drop child rows first (images/videos cascade anyway), then
      // the product. deleteMany avoids Prisma's P2025 throw on a missing row.
      await prisma.product_images.deleteMany({ where: { product_id: id } });
      await prisma.product_videos.deleteMany({ where: { product_id: id } });
      await prisma.products.deleteMany({ where: { id } });
      return json({ ok: true });
    }

    if (op === "bulkPublish") {
      const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
      const publish = !!body?.publish;
      if (!ids.length) return json({ ok: false, error: "NO_IDS" }, 400);
      await prisma.products.updateMany({ where: { id: { in: ids } }, data: { is_published: publish } });
      return json({ ok: true });
    }

    return json({ ok: false, error: "BAD_OP" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WRITE_FAILED" }, 500);
  }
}
