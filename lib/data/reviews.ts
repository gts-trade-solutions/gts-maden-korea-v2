import "server-only";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Read layer for the PDP review list. Reproduces product.tsx's fetchReviews:
// status='published' only, sortable, optional country filter, and the
// "visitor-country first" two-bucket pagination when no filter is set.

const SORT_ORDER: Record<string, any> = {
  helpful: [{ helpful_count: "desc" }, { created_at: "desc" }],
  recent: [{ created_at: "desc" }],
  high: [{ rating: "desc" }, { created_at: "desc" }],
  low: [{ rating: "asc" }, { created_at: "desc" }],
};
const MY_COUNTRY_CAP = 200;

export async function getReviewsMysql(
  productId: string,
  opts: { sort: string; countryFilter?: string | null; page: number; pageSize: number; visitorCountry?: string | null }
) {
  const { sort, countryFilter, page, pageSize, visitorCountry } = opts;
  const orderBy = SORT_ORDER[sort] ?? SORT_ORDER.recent;
  const base = { product_id: productId, status: "published" as const };

  let rows: any[];
  if (visitorCountry && !countryFilter) {
    if (page <= 1) {
      const [mine, other] = await Promise.all([
        prisma.product_reviews.findMany({ where: { ...base, country: visitorCountry }, orderBy, take: MY_COUNTRY_CAP }),
        prisma.product_reviews.findMany({ where: { ...base, country: { not: visitorCountry } }, orderBy, take: pageSize }),
      ]);
      rows = [...mine, ...other];
    } else {
      rows = await prisma.product_reviews.findMany({
        where: { ...base, country: { not: visitorCountry } },
        orderBy, skip: (page - 1) * pageSize, take: pageSize,
      });
    }
  } else {
    rows = await prisma.product_reviews.findMany({
      where: { ...base, ...(countryFilter ? { country: countryFilter } : {}) },
      orderBy, skip: (page - 1) * pageSize, take: pageSize,
    });
  }
  return jsonSafe(rows) as any[];
}

export async function getReviewCountriesMysql(productId: string) {
  const rows = await prisma.product_reviews.findMany({
    where: { product_id: productId, status: "published", country: { not: null } },
    select: { country: true },
    distinct: ["country"],
  });
  return rows.map((r) => r.country).filter(Boolean).sort();
}

export async function getReviewCountMysql(productId: string, countryFilter?: string | null) {
  return prisma.product_reviews.count({
    where: { product_id: productId, status: "published", ...(countryFilter ? { country: countryFilter } : {}) },
  });
}
