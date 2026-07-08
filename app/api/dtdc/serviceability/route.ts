import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// We service every Indian pincode we have a row for. ETAs come from a
// six-zone table that admins can edit at /admin/settings/shipping-zones.
// The DTDC/Shipsy live serviceability call has been removed - that endpoint
// doesn't exist in their public API.
//
// This reproduces the old `lookup_pincode_eta` Postgres RPC in the app
// layer: look the pincode up in `pincodes`, join its `shipping_zones` row
// for the zone label + ETA window, and derive the max delivery date from
// eta_days_max. A missing pincode row means we simply don't have data yet
// (known:false), not that we don't deliver there.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("pincode") ?? "";
  const pincode = raw.trim().replace(/[^0-9]/g, "");
  if (pincode.length !== 6) {
    return NextResponse.json({ ok: false, error: "BAD_PINCODE" }, { status: 400 });
  }

  let row:
    | {
        pincode: string;
        place_name: string;
        district: string | null;
        state: string;
        zone: string;
        shipping_zones: {
          label: string;
          eta_days_min: number;
          eta_days_max: number;
        } | null;
      }
    | null = null;

  try {
    row = await prisma.pincodes.findUnique({
      where: { pincode },
      select: {
        pincode: true,
        place_name: true,
        district: true,
        state: true,
        zone: true,
        shipping_zones: {
          select: { label: true, eta_days_min: true, eta_days_max: true },
        },
      },
    });
  } catch (error) {
    console.error("[serviceability] lookup error", error);
    return NextResponse.json(
      { ok: false, error: "LOOKUP_FAILED" },
      { status: 500 },
    );
  }

  if (!row || !row.shipping_zones) {
    // No row for this pincode. We don't have data for it yet — surface that
    // explicitly so the UI can prompt the user to email us, rather than
    // claiming we don't deliver there.
    return NextResponse.json({
      ok: true,
      pincode,
      serviceable: null,
      known: false,
    });
  }

  const zone = row.shipping_zones;

  // estimated_max_delivery_date = today + eta_days_max (date only), matching
  // the RPC's (current_date + eta_days_max) output.
  const estimated = new Date();
  estimated.setUTCDate(estimated.getUTCDate() + Number(zone.eta_days_max));
  const estimatedMaxDeliveryDate = estimated.toISOString().slice(0, 10);

  return NextResponse.json({
    ok: true,
    pincode: row.pincode,
    placeName: row.place_name,
    district: row.district,
    state: row.state,
    zone: row.zone,
    zoneLabel: zone.label,
    serviceable: true,
    known: true,
    etaDaysMin: zone.eta_days_min,
    etaDaysMax: zone.eta_days_max,
    estimatedMaxDeliveryDate,
  });
}
