export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDeliveryEstimate } from "@/lib/shipping/deliveryEstimate";

// Public endpoint: returns a delivery estimate for a destination.
// Called by the cart + checkout to render "Delivers in X-Y days"
// alongside the shipping fee. No auth — the underlying tables are
// public-read (shipping_zones / country_shipping_rates).
//
// Query: ?country=US&pincode=600001 (pincode only used when country=IN)

export async function GET(req: Request) {
  const url = new URL(req.url);
  const country = (url.searchParams.get("country") || "IN").toUpperCase();
  const pincode = url.searchParams.get("pincode") || undefined;

  const eta = await getDeliveryEstimate(country, pincode);

  return NextResponse.json(
    { ok: true, eta },
    {
      headers: {
        // Cache for 60s at the edge to match the in-process cache the
        // helper uses. Stale-while-revalidate keeps it snappy after.
        "Cache-Control":
          "public, s-maxage=60, stale-while-revalidate=300, max-age=30",
      },
    }
  );
}
