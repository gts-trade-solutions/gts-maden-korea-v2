export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getShippingConfig } from "@/lib/storeSettings";

/**
 * Public shipping config for cart / checkout previews. The values are
 * already shown on the storefront ("Free delivery above ₹X") so there's
 * nothing sensitive about them. Authoritative pricing still happens
 * server-side in /api/checkout/calc-totals.
 */
export async function GET() {
  const config = await getShippingConfig();
  return NextResponse.json(
    {
      ok: true,
      deliveryThreshold: config.deliveryThreshold,
      defaultShippingFee: config.defaultShippingFee,
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } }
  );
}
