import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

export const dynamic = "force-dynamic";

// GET /api/catalog/related?product_id=...&brand_id=...
// Related products for the PDP "you may also like" widget. The CLIENT can't
// read the server-only CATALOG_BACKEND flag, so the flag lives here: it serves
// MySQL when CATALOG_BACKEND=mysql, otherwise falls back to Supabase.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("product_id");
  const brandId = searchParams.get("brand_id");
  if (!productId) return NextResponse.json({ related: [] });

  const cookieCountry = cookies().get("mik_country")?.value;
  const country = isSupportedCountry(cookieCountry) ? cookieCountry : DEFAULT_COUNTRY;

  if (process.env.CATALOG_BACKEND === "mysql") {
    const { getRelatedProductsMysql } = await import("@/lib/data/catalog");
    const related = await getRelatedProductsMysql(productId, brandId, country);
    return NextResponse.json({ related });
  }

  // Supabase fallback (default)
  const { createClient } = await import("@supabase/supabase-js");
  const { augmentProductsWithCountryOffers } = await import("@/lib/pricing");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  let q = sb
    .from("products")
    .select(
      `id, slug, name, price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
       hero_image_path, stock_qty, is_published, is_bundle, brands ( name )`
    )
    .eq("is_published", true)
    .neq("id", productId);
  if (brandId) q = q.eq("brand_id", brandId);
  const { data } = await q.order("created_at", { ascending: false }).limit(8);
  const related = await augmentProductsWithCountryOffers((data ?? []) as any[], country, sb);
  return NextResponse.json({ related });
}
