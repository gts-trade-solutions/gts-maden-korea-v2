import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";
import { getRelatedProductsMysql } from "@/lib/data/catalog";

export const dynamic = "force-dynamic";

// GET /api/catalog/related?product_id=...&brand_id=...
// Related products for the PDP "you may also like" widget. Served from MySQL
// (Prisma) — the CLIENT can't read the server-only backend, so the fetch lives
// here.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("product_id");
  const brandId = searchParams.get("brand_id");
  if (!productId) return NextResponse.json({ related: [] });

  const cookieCountry = cookies().get("mik_country")?.value;
  const country = isSupportedCountry(cookieCountry) ? cookieCountry : DEFAULT_COUNTRY;

  const related = await getRelatedProductsMysql(productId, brandId, country);
  return NextResponse.json({ related });
}
