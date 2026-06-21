import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

// GET /api/catalog/reviews?product_id=&sort=&country=&page=&page_size=&first=1
// Published review list with the two-bucket (visitor-country-first) pagination.
// `first=1` also returns the country filter list + total count. MySQL via flag,
// Supabase fallback. Anonymous read (status='published').
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("product_id");
  if (!productId) return NextResponse.json({ reviews: [] });

  const sort = searchParams.get("sort") || "recent";
  const countryFilter = searchParams.get("country") || null;
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(50, Number(searchParams.get("page_size") || 8) || 8);
  const first = searchParams.get("first") === "1";

  // Visitor country = raw mik_country cookie (matches the client's
  // readCountryFromCookie), only used when no explicit filter is set.
  const cookieCountry = cookies().get("mik_country")?.value || null;
  const visitorCountry = !countryFilter ? cookieCountry : null;

  if (process.env.CATALOG_BACKEND === "mysql") {
    const { getReviewsMysql, getReviewCountriesMysql, getReviewCountMysql } = await import("@/lib/data/reviews");
    const reviews = await getReviewsMysql(productId, { sort, countryFilter, page, pageSize, visitorCountry });
    const body: any = { reviews };
    if (first) {
      const [countries, count] = await Promise.all([
        getReviewCountriesMysql(productId),
        getReviewCountMysql(productId, countryFilter),
      ]);
      body.countries = countries;
      body.count = count;
    }
    return NextResponse.json(body);
  }

  // Supabase fallback — replicate the two-bucket logic.
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const applySort = (q: any) => {
    if (sort === "helpful") return q.order("helpful_count", { ascending: false }).order("created_at", { ascending: false });
    if (sort === "high") return q.order("rating", { ascending: false }).order("created_at", { ascending: false });
    if (sort === "low") return q.order("rating", { ascending: true }).order("created_at", { ascending: false });
    return q.order("created_at", { ascending: false });
  };
  const baseQ = () => applySort(sb.from("product_reviews").select("*").eq("product_id", productId).eq("status", "published"));
  let reviews: any[] = [];
  if (visitorCountry && !countryFilter) {
    if (page <= 1) {
      const [mine, other] = await Promise.all([
        baseQ().eq("country", visitorCountry).range(0, 199),
        baseQ().neq("country", visitorCountry).range(0, pageSize - 1),
      ]);
      reviews = [...(mine.data ?? []), ...(other.data ?? [])];
    } else {
      const from = (page - 1) * pageSize;
      reviews = (await baseQ().neq("country", visitorCountry).range(from, from + pageSize - 1)).data ?? [];
    }
  } else {
    let q = baseQ();
    if (countryFilter) q = q.eq("country", countryFilter);
    const from = (page - 1) * pageSize;
    reviews = (await q.range(from, from + pageSize - 1)).data ?? [];
  }
  const body: any = { reviews };
  if (first) {
    const { data: cRows } = await sb.from("product_reviews").select("country").eq("product_id", productId).eq("status", "published").not("country", "is", null);
    body.countries = Array.from(new Set((cRows ?? []).map((r: any) => r.country).filter(Boolean))).sort();
    let cq = sb.from("product_reviews").select("id", { count: "exact", head: true }).eq("product_id", productId).eq("status", "published");
    if (countryFilter) cq = cq.eq("country", countryFilter);
    body.count = (await cq).count ?? 0;
  }
  return NextResponse.json(body);
}
