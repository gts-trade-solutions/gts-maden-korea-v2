import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/catalog/nav
// Header navigation dictionaries from MySQL: categories + active brands (each
// with a published-product count) and the featured-product ticker. Shapes match
// what the old Supabase `products(count)` selects returned, so Header's
// withCount() helper works unchanged. Read-only, public.
export async function GET() {
  const [cats, brs, featured, catCounts, brandCounts] = await Promise.all([
    prisma.categories.findMany({
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true },
    }),
    prisma.brands.findMany({
      where: { active: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true, active: true, position: true },
    }),
    prisma.products.findMany({
      where: { is_published: true, is_featured: true, deleted_at: null },
      orderBy: { created_at: "desc" },
      take: 10,
      select: {
        slug: true, name: true, price: true, currency: true, short_description: true,
        sale_price: true, sale_starts_at: true, sale_ends_at: true,
      },
    }),
    prisma.products.groupBy({
      by: ["category_id"],
      where: { is_published: true, deleted_at: null },
      _count: { _all: true },
    }),
    prisma.products.groupBy({
      by: ["brand_id"],
      where: { is_published: true, deleted_at: null },
      _count: { _all: true },
    }),
  ]);

  const catCount = new Map<string, number>();
  for (const r of catCounts) if (r.category_id) catCount.set(r.category_id, r._count._all);
  const brandCount = new Map<string, number>();
  for (const r of brandCounts) if (r.brand_id) brandCount.set(r.brand_id, r._count._all);

  const categories = cats.map((c) => ({
    slug: c.slug,
    name: c.name,
    products: [{ count: catCount.get(c.id) ?? 0 }],
  }));
  const brands = brs.map((b) => ({
    slug: b.slug,
    name: b.name,
    active: b.active,
    position: b.position,
    products: [{ count: brandCount.get(b.id) ?? 0 }],
  }));

  return NextResponse.json(
    jsonSafe({ categories, brands, featuredTicker: featured }),
  );
}
