import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

export const dynamic = "force-dynamic";

// GET /api/catalog/products/by-ids?ids=a,b,c — published products for an
// explicit id list, country-priced. MySQL via flag, Supabase fallback.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = (searchParams.get("ids") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 24);
  if (!ids.length) return NextResponse.json({ products: [] });

  const cookieCountry = cookies().get("mik_country")?.value;
  const country = isSupportedCountry(cookieCountry) ? cookieCountry : DEFAULT_COUNTRY;

  if (process.env.CATALOG_BACKEND === "mysql") {
    const { getProductsByIdsMysql } = await import("@/lib/data/catalog");
    return NextResponse.json({ products: await getProductsByIdsMysql(ids, country) });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const { augmentProductsWithCountryOffers } = await import("@/lib/pricing");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await sb
    .from("products")
    .select(`id, slug, name, price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at, hero_image_path, stock_qty, is_bundle, brands(name)`)
    .in("id", ids).eq("is_published", true);
  return NextResponse.json({ products: await augmentProductsWithCountryOffers((data ?? []) as any[], country, sb) });
}
