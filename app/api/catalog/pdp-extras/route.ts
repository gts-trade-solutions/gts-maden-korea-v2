import { NextResponse } from "next/server";
import { jsonSafe } from "@/lib/db/serialize";
import {
  getProductImagesMysql,
  getProductVideosMysql,
  getVendorDisclosureMysql,
  getReviewStatsMysql,
  fetchCountryOffersMysql,
} from "@/lib/data/catalog";

export const dynamic = "force-dynamic";

// GET /api/catalog/pdp-extras?product_id=&vendor_id=&country=
// One MySQL round-trip for everything the PDP client used to load from Supabase
// after hydration: gallery images, videos, marketplace vendor disclosure,
// aggregate review stats, and the visitor-country offer price. Read-only,
// public. Replaces the browser's direct Supabase queries on the product page.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("product_id") ?? "";
  const vendorId = searchParams.get("vendor_id") ?? "";
  const country = searchParams.get("country") ?? "";

  if (!productId) {
    return NextResponse.json({
      images: [], videos: [], vendor: null, reviewStats: null, countryOffer: null,
    });
  }

  const [images, videos, vendor, reviewStats, offersMap] = await Promise.all([
    getProductImagesMysql(productId),
    getProductVideosMysql(productId),
    getVendorDisclosureMysql(vendorId),
    getReviewStatsMysql(productId),
    country
      ? fetchCountryOffersMysql([productId], country)
      : Promise.resolve({} as Record<string, number>),
  ]);

  const countryOffer =
    offersMap[productId] != null ? Number(offersMap[productId]) : null;

  return NextResponse.json(
    jsonSafe({ images, videos, vendor, reviewStats, countryOffer }),
  );
}
