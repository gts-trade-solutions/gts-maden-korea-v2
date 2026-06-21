import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// We service every Indian pincode we have a row for. ETAs come from a
// six-zone table that admins can edit at /admin/settings/shipping-zones.
// The DTDC/Shipsy live serviceability call has been removed - that endpoint
// doesn't exist in their public API.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("pincode") ?? "";
  const pincode = raw.trim().replace(/[^0-9]/g, "");
  if (pincode.length !== 6) {
    return NextResponse.json({ ok: false, error: "BAD_PINCODE" }, { status: 400 });
  }

  type LookupRow = {
    pincode: string;
    place_name: string;
    district: string | null;
    state: string;
    zone: string;
    label: string;
    eta_days_min: number;
    eta_days_max: number;
    estimated_max_delivery_date: string;
    serviceable: boolean;
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .rpc("lookup_pincode_eta", { p_pincode: pincode })
    .maybeSingle<LookupRow>();

  if (error) {
    console.error("[serviceability] rpc error", error);
    return NextResponse.json(
      { ok: false, error: "LOOKUP_FAILED" },
      { status: 500 },
    );
  }

  if (!data) {
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

  return NextResponse.json({
    ok: true,
    pincode: data.pincode,
    placeName: data.place_name,
    district: data.district,
    state: data.state,
    zone: data.zone,
    zoneLabel: data.label,
    serviceable: data.serviceable,
    known: true,
    etaDaysMin: data.eta_days_min,
    etaDaysMax: data.eta_days_max,
    estimatedMaxDeliveryDate: data.estimated_max_delivery_date,
  });
}
