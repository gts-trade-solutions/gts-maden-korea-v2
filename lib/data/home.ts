import "server-only";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// MySQL reproductions of the home `_live` VIEWS (which weren't migrated).
// Each mirrors the view's WHERE/ORDER exactly so the storefront output is
// identical behind the CATALOG_BACKEND flag.

// home_banners_live: active = true AND within [starts_at, ends_at] window.
export async function getBannersMysql(scope: string, country: string) {
  const now = new Date();
  const rows = await prisma.home_banners.findMany({
    where: {
      active: true,
      page_scope: scope,
      country,
      AND: [
        { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
        { OR: [{ ends_at: null }, { ends_at: { gte: now } }] },
      ],
    },
    select: {
      id: true, alt: true, image_path: true, video_url: true, link_url: true,
      position: true, page_scope: true, active: true, updated_at: true, country: true,
    },
    orderBy: { position: "asc" },
  });
  return jsonSafe(rows) as any[];
}

// brands_live: active brands + COUNT of published products per brand.
export async function getBrandsLiveMysql() {
  const brands = await prisma.brands.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  const counts = await prisma.products.groupBy({
    by: ["brand_id"],
    where: { is_published: true, brand_id: { not: null } },
    _count: { _all: true },
  });
  const countMap: Record<string, number> = {};
  for (const c of counts) if (c.brand_id) countMap[c.brand_id] = c._count._all;
  return jsonSafe(
    brands.map((b) => ({ ...b, product_count: countMap[b.id] ?? 0 }))
  ) as any[];
}

// home_influencer_videos_live: active + schedule window, with attached
// products (M:N through home_influencer_video_products) shaped as `attached`
// to match the Supabase nested-select the caller expects.
export async function getInfluencerVideosLiveMysql(pageScope: string, limit: number) {
  const now = new Date();
  const videos = await prisma.home_influencer_videos.findMany({
    where: {
      active: true,
      page_scope: pageScope,
      AND: [
        { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
        { OR: [{ ends_at: null }, { ends_at: { gte: now } }] },
      ],
    },
    orderBy: { position: "asc" },
    take: limit,
    include: {
      home_influencer_video_products: {
        select: {
          position: true,
          products: {
            select: {
              id: true, slug: true, name: true, price: true, currency: true,
              compare_at_price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true,
              hero_image_path: true, is_featured: true, is_trending: true, is_bundle: true,
              short_description: true, volume_ml: true, net_weight_g: true,
              country_of_origin: true, stock_qty: true,
              brands: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const shaped = videos.map((v) => {
    const { home_influencer_video_products, ...rest } = v as any;
    return { ...rest, attached: home_influencer_video_products };
  });
  return jsonSafe(shaped) as any[];
}

// home_product_videos (active + schedule window) with attached products
// through home_product_video_products. Mirrors HomeVideoCarouselSection.
export async function getProductVideosLiveMysql(pageScope: string, limit: number) {
  const now = new Date();
  const rows = await prisma.home_product_videos.findMany({
    where: {
      active: true,
      page_scope: pageScope,
      AND: [
        { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
        { OR: [{ ends_at: null }, { ends_at: { gte: now } }] },
      ],
    },
    orderBy: { position: "asc" },
    take: limit,
    select: {
      id: true, title: true, description: true, page_scope: true, position: true,
      video_path: true, video_url: true, thumbnail_path: true, thumbnail_url: true,
      product_id: true, created_at: true, updated_at: true,
      home_product_video_products: {
        select: {
          position: true,
          products: {
            select: {
              id: true, slug: true, name: true, price: true, currency: true,
              compare_at_price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true,
              hero_image_path: true, is_featured: true, is_trending: true, is_bundle: true,
              short_description: true, volume_ml: true, net_weight_g: true,
              country_of_origin: true, stock_qty: true,
              brands: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const shaped = rows.map((v) => {
    const { home_product_video_products, ...rest } = v as any;
    return { ...rest, attached: home_product_video_products };
  });
  return jsonSafe(shaped) as any[];
}
