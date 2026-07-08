import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { fetchCountryOffersMysql } from "@/lib/data/catalog";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

export const dynamic = "force-dynamic";

// GET /api/catalog/cart-products?ids=a,b,c&published=1
// Line-item products for the cart / checkout summary (by id) plus the
// visitor-country offer map, from MySQL. Mirrors the exact shape the cart and
// checkout used to read directly from Supabase:
//   { products: [{ id, slug, name, price, currency, is_published,
//                  compare_at_price, sale_price, sale_starts_at, sale_ends_at,
//                  hero_image_path, brands: { name } }],
//     offers: { [product_id]: offerPrice } }
// `published=1` restricts to published products (checkout); cart omits it so it
// can still show/flag unpublished line items. Read-only, public.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = (searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (!ids.length) return NextResponse.json({ products: [], offers: {} });

  const publishedOnly = searchParams.get("published") === "1";
  const cookieCountry = cookies().get("mik_country")?.value;
  const country = isSupportedCountry(cookieCountry) ? cookieCountry : DEFAULT_COUNTRY;

  const [products, offers] = await Promise.all([
    prisma.products.findMany({
      where: { id: { in: ids }, ...(publishedOnly ? { is_published: true } : {}) },
      select: {
        id: true, slug: true, name: true, price: true, currency: true, is_published: true,
        compare_at_price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true,
        hero_image_path: true, brands: { select: { name: true } },
      },
    }),
    fetchCountryOffersMysql(ids, country),
  ]);

  return NextResponse.json(jsonSafe({ products, offers }));
}
