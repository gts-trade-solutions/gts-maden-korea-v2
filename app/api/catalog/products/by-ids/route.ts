import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";
import { getProductsByIdsMysql } from "@/lib/data/catalog";

export const dynamic = "force-dynamic";

// GET /api/catalog/products/by-ids?ids=a,b,c — published products for an
// explicit id list, country-priced. MySQL (Prisma) only.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = (searchParams.get("ids") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 24);
  if (!ids.length) return NextResponse.json({ products: [] });

  const cookieCountry = cookies().get("mik_country")?.value;
  const country = isSupportedCountry(cookieCountry) ? cookieCountry : DEFAULT_COUNTRY;

  return NextResponse.json({ products: await getProductsByIdsMysql(ids, country) });
}
