import "server-only";
import { prisma } from "@/lib/db/prisma";
import { effectivePriceForCountry } from "@/lib/pricing";
import { jsonSafe } from "@/lib/db/serialize";

// ── Catalog read layer (MySQL via Prisma) ─────────────────────────────────
// This is the new server-side data-access layer for the storefront read path.
// It mirrors what the current Supabase `.from('products')` queries return, so
// the storefront can be repointed here one surface at a time.

export type ProductListOpts = {
  limit?: number;
  featured?: boolean;
  trending?: boolean;
};

export async function getPublishedProducts(opts: ProductListOpts = {}) {
  const { limit = 24, featured, trending } = opts;
  return prisma.products.findMany({
    where: {
      is_published: true,
      deleted_at: null,
      ...(featured ? { is_featured: true } : {}),
      ...(trending ? { is_trending: true } : {}),
    },
    orderBy: featured
      ? [{ featured_rank: "asc" }, { created_at: "desc" }]
      : { created_at: "desc" },
    take: limit,
    include: { brands: { select: { name: true, slug: true } } },
  });
}

export async function getProductBySlug(slug: string) {
  return prisma.products.findUnique({
    where: { slug },
    include: {
      brands: { select: { name: true, slug: true } },
      product_images: { orderBy: { sort_order: "asc" } },
    },
  });
}

export async function getActiveBrands() {
  return prisma.brands.findMany({
    where: { active: true },
    orderBy: { position: "asc" },
  });
}

export async function getCategories() {
  return prisma.categories.findMany({ orderBy: { name: "asc" } });
}

// ── Home editorial rails (featured / trending) ────────────────────────────
// Mirrors the Supabase query in app/page.tsx -> fetchEditorial: same columns,
// same ordering, with translations attached as `product_translations` so the
// existing mergeTranslations() helper works unchanged. jsonSafe() converts
// Decimal->number and Date->ISO string so the shape matches what Supabase/
// PostgREST returned (the storefront cards expect plain numbers/strings).
export async function getEditorialProducts(
  kind: "featured" | "trending",
  limit = 8
) {
  const products = await prisma.products.findMany({
    where: {
      is_published: true,
      deleted_at: null,
      ...(kind === "featured" ? { is_featured: true } : { is_trending: true }),
    },
    orderBy:
      kind === "featured"
        ? [{ featured_rank: "asc" }, { created_at: "desc" }]
        : [{ purchases_count: "desc" }, { created_at: "desc" }],
    take: limit,
    select: {
      id: true, slug: true, name: true, price: true, currency: true,
      compare_at_price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true,
      is_featured: true, is_trending: true, is_bundle: true, new_until: true,
      short_description: true, volume_ml: true, net_weight_g: true, country_of_origin: true,
      hero_image_path: true, stock_qty: true,
      brands: { select: { name: true } },
    },
  });

  const ids = products.map((p) => p.id);
  const translations = ids.length
    ? await prisma.product_translations.findMany({
        where: { product_id: { in: ids } },
        select: { product_id: true, locale: true, short_description: true, description: true },
      })
    : [];
  const byId: Record<string, any[]> = {};
  for (const tr of translations) {
    (byId[tr.product_id] ??= []).push({
      locale: tr.locale,
      short_description: tr.short_description,
      description: tr.description,
    });
  }

  const shaped = products.map((p) => ({ ...p, product_translations: byId[p.id] ?? [] }));
  return jsonSafe(shaped) as any[];
}

// MySQL equivalent of lib/pricing -> augmentProductsWithCountryOffers.
// Reuses the pure effectivePriceForCountry() resolver; only the offer lookup
// is re-pointed from Supabase to Prisma/MySQL.
export async function applyCountryOffers<T extends { id?: string | null }>(
  products: T[],
  countryCode: string
): Promise<Array<T & { effective_price: number }>> {
  const ids = products
    .map((p) => p.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const offers: Record<string, number> = {};
  if (ids.length && countryCode) {
    const rows = await prisma.product_country_prices.findMany({
      where: { product_id: { in: ids }, country_code: countryCode, is_active: true },
      select: { product_id: true, offer_price: true },
    });
    for (const r of rows) offers[r.product_id] = Number(r.offer_price);
  }
  return products.map((p) => ({
    ...p,
    effective_price: effectivePriceForCountry(p as any, offers),
  }));
}

// ── Product detail page (MySQL) ───────────────────────────────────────────
// Mirrors the Supabase fetches in app/products/[slug]/page.tsx so the PDP can
// be served from MySQL behind the CATALOG_BACKEND flag.

const PRODUCT_DETAIL_SELECT = {
  id: true, slug: true, name: true, short_description: true, description: true,
  price: true, currency: true, sale_price: true, compare_at_price: true,
  sale_starts_at: true, sale_ends_at: true, is_published: true, brand_id: true,
  category_id: true, hero_image_path: true, stock_qty: true, sku: true,
  volume_ml: true, net_weight_g: true, country_of_origin: true, new_until: true,
  is_featured: true, is_trending: true, is_bundle: true, made_in_korea: true,
  is_vegetarian: true, cruelty_free: true, toxin_free: true, paraben_free: true,
  ingredients_md: true, key_features_md: true, additional_details_md: true,
  box_contents_md: true, key_benefits: true, video_path: true, vendor_id: true,
  brands: { select: { name: true, slug: true } },
} as const;

export async function getProductDetailBySlug(slug: string) {
  const product = await prisma.products.findFirst({
    where: { slug, is_published: true },
    select: PRODUCT_DETAIL_SELECT,
  });
  if (!product) return null;
  const translations = await prisma.product_translations.findMany({
    where: { product_id: (product as any).id },
    select: {
      locale: true, short_description: true, description: true, ingredients_md: true,
      additional_details_md: true, key_features_md: true, box_contents_md: true,
      faq: true, key_benefits: true, additional_details: true,
    },
  });
  return jsonSafe({ ...product, product_translations: translations });
}

export async function getProductImagesMysql(productId: string) {
  const rows = await prisma.product_images.findMany({
    where: { product_id: productId },
    select: { storage_path: true, alt: true, sort_order: true },
    orderBy: { sort_order: "asc" },
    take: 8,
  });
  return jsonSafe(rows) as Array<{ storage_path: string; alt: string | null; sort_order: number }>;
}

export async function getStoryBlocksMysql(productId: string) {
  const rows = await prisma.product_story_blocks.findMany({
    where: { product_id: productId },
    orderBy: { position: "asc" },
  });
  return jsonSafe(rows) as any[];
}

// Reproduces the product_review_stats VIEW (not migrated): count + avg over
// status='published' reviews. Returns null when there are none (matches the
// view's GROUP BY producing no row).
export async function getReviewStatsMysql(productId: string) {
  const agg = await prisma.product_reviews.aggregate({
    where: { product_id: productId, status: "published" },
    _count: { _all: true },
    _avg: { rating: true },
  });
  const count = agg._count._all ?? 0;
  if (!count) return null;
  const avg = agg._avg.rating;
  return {
    rating_avg: avg != null ? Math.round(Number(avg) * 100) / 100 : null,
    rating_count: count,
  };
}

export async function fetchCountryOffersMysql(productIds: string[], countryCode: string) {
  const offers: Record<string, number> = {};
  if (!productIds.length || !countryCode) return offers;
  const rows = await prisma.product_country_prices.findMany({
    where: { product_id: { in: productIds }, country_code: countryCode, is_active: true },
    select: { product_id: true, offer_price: true },
  });
  for (const r of rows) offers[r.product_id] = Number(r.offer_price);
  return offers;
}

// ── Browse pages: brand directory / brand detail / category / search ──────
// Shared product-card projection used by listing pages (brand, category,
// search). Superset of the columns each Supabase query selected.
const PRODUCT_CARD_SELECT = {
  id: true, slug: true, name: true, price: true, currency: true,
  compare_at_price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true,
  short_description: true, volume_ml: true, net_weight_g: true, country_of_origin: true,
  hero_image_path: true, created_at: true, stock_qty: true,
  is_featured: true, is_trending: true, is_bundle: true, new_until: true,
  brands: { select: { name: true, slug: true } },
} as const;

async function attachProductTranslations(products: any[]) {
  const ids = products.map((p) => p.id);
  const translations = ids.length
    ? await prisma.product_translations.findMany({
        where: { product_id: { in: ids } },
        select: { product_id: true, locale: true, short_description: true, description: true },
      })
    : [];
  const byId: Record<string, any[]> = {};
  for (const tr of translations) {
    (byId[tr.product_id] ??= []).push({
      locale: tr.locale, short_description: tr.short_description, description: tr.description,
    });
  }
  return products.map((p) => ({ ...p, product_translations: byId[p.id] ?? [] }));
}

// /brands directory: brands that have >=1 published product, with the count.
export async function getBrandsDirectoryMysql() {
  const counts = await prisma.products.groupBy({
    by: ["brand_id"],
    where: { is_published: true, brand_id: { not: null } },
    _count: { _all: true },
  });
  const countMap: Record<string, number> = {};
  for (const c of counts) if (c.brand_id) countMap[c.brand_id] = c._count._all;
  const ids = Object.keys(countMap);
  if (!ids.length) return [];
  const brands = await prisma.brands.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, name: true, thumbnail_url: true, thumbnail_path: true },
    orderBy: { name: "asc" },
  });
  return jsonSafe(brands.map((b) => ({ ...b, product_count: countMap[b.id] ?? 0 }))) as any[];
}

// /brand/[slug]: brand row + its translations.
export async function getBrandWithTranslationsBySlug(slug: string) {
  const brand = await prisma.brands.findUnique({ where: { slug } });
  if (!brand) return null;
  const brand_translations = await prisma.brand_translations.findMany({
    where: { brand_id: brand.id },
    select: { locale: true, description: true },
  });
  return jsonSafe({ ...brand, brand_translations });
}

export async function getBrandProductsMysql(brandId: string) {
  const products = await prisma.products.findMany({
    where: { brand_id: brandId, is_published: true },
    orderBy: { created_at: "desc" },
    select: PRODUCT_CARD_SELECT,
  });
  return jsonSafe(await attachProductTranslations(products)) as any[];
}

// /c/[slug]: category row + its translations.
export async function getCategoryWithTranslationsBySlug(slug: string) {
  const category = await prisma.categories.findUnique({ where: { slug } });
  if (!category) return null;
  const category_translations = await prisma.category_translations.findMany({
    where: { category_id: category.id },
    select: { locale: true, name: true, description: true },
  });
  return jsonSafe({ ...category, category_translations });
}

export async function getCategoryProductsMysql(categoryId: string) {
  const products = await prisma.products.findMany({
    where: { category_id: categoryId, is_published: true },
    select: PRODUCT_CARD_SELECT,
  });
  return jsonSafe(await attachProductTranslations(products)) as any[];
}

// /search: replaces the Postgres tsvector RPC `search_products_tsv` with a
// MySQL FULLTEXT match, falling back to substring LIKE for short tokens /
// stopwords that FULLTEXT natural-language mode skips.
export async function searchProductsMysql(query: string, limit = 40) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  let idRows: Array<{ id: string }> = [];
  try {
    idRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM products
      WHERE is_published = 1
        AND MATCH(name, short_description, description) AGAINST (${trimmed} IN NATURAL LANGUAGE MODE)
      LIMIT ${limit}
    `;
  } catch {
    idRows = [];
  }
  if (idRows.length === 0) {
    const like = await prisma.products.findMany({
      where: {
        is_published: true,
        OR: [
          { name: { contains: trimmed } },
          { short_description: { contains: trimmed } },
          { slug: { contains: trimmed } },
        ],
      },
      select: { id: true },
      take: limit,
    });
    idRows = like as any;
  }

  const ids = idRows.map((r) => r.id);
  if (!ids.length) return [];
  const products = await prisma.products.findMany({
    where: { id: { in: ids }, is_published: true },
    select: PRODUCT_CARD_SELECT,
  });
  const withTr = await attachProductTranslations(products);
  const byId = new Map(withTr.map((p: any) => [p.id, p]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  return jsonSafe(ordered) as any[];
}

// PDP "related products" widget: brand-matched (falls back to any), published,
// newest 8, excluding the current product, with country-aware effective_price.
export async function getRelatedProductsMysql(
  productId: string,
  brandId: string | null,
  country: string
) {
  const products = await prisma.products.findMany({
    where: {
      is_published: true,
      id: { not: productId },
      ...(brandId ? { brand_id: brandId } : {}),
    },
    orderBy: { created_at: "desc" },
    take: 8,
    select: {
      id: true, slug: true, name: true, price: true, currency: true,
      compare_at_price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true,
      hero_image_path: true, stock_qty: true, is_published: true, is_bundle: true,
      brands: { select: { name: true } },
    },
  });
  return applyCountryOffers(jsonSafe(products), country);
}

// Products by an explicit id list (published), country-priced. Used by the
// account dashboard's "recently viewed" rail (ids come from localStorage).
export async function getProductsByIdsMysql(ids: string[], country: string) {
  if (!ids.length) return [];
  const products = await prisma.products.findMany({
    where: { id: { in: ids }, is_published: true },
    select: {
      id: true, slug: true, name: true, price: true, currency: true,
      compare_at_price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true,
      hero_image_path: true, stock_qty: true, is_bundle: true,
      brands: { select: { name: true } },
    },
  });
  return applyCountryOffers(jsonSafe(products), country);
}
