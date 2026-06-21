import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { dtdcCancelConsignment, DTDC_SHIPSY } from "@/lib/dtdc";

const NON_CANCELABLE = new Set([
  "delivered",
  "cancelled",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const order_id = String(body?.order_id || "").trim();
    const shipment_id = String(body?.shipment_id || "").trim();

    if (!order_id && !shipment_id) {
      return NextResponse.json({ ok: false, error: "Missing order_id or shipment_id" }, { status: 400 });
    }

    // 1) Load active shipment
    let shipment: any = null;

    if (shipment_id) {
      const { data, error } = await supabaseAdmin
        .from("dtdc_shipments")
        .select("*")
        .eq("id", shipment_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      shipment = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("dtdc_shipments")
        .select("*")
        .eq("order_id", order_id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      shipment = data;
    }

    if (!shipment?.id) throw new Error("DTDC shipment not found");
    if (!shipment?.reference_number) throw new Error("Missing reference_number (AWB). Create shipment first.");

    if (shipment.status && NON_CANCELABLE.has(String(shipment.status))) {
      throw new Error(`Shipment cannot be cancelled (current status: ${shipment.status})`);
    }

    // 2) Mark cancel requested (optional but nice)
    await supabaseAdmin
      .from("dtdc_shipments")
      .update({ status: "cancel_requested" })
      .eq("id", shipment.id);

    // 3) Call DTDC cancel API
    const cancelReq = {
      AWBNo: [String(shipment.reference_number)],
      customerCode: DTDC_SHIPSY.customerCode,
    };

    const resp = await dtdcCancelConsignment(cancelReq, shipment.id);

    // DTDC response contains successConsignments[] with per-AWB success
    const successRow =
      resp?.successConsignments?.find((x: any) => x?.reference_number === shipment.reference_number) ||
      resp?.successConsignments?.[0];

    const isSuccess = !!successRow?.success;

    if (!isSuccess) {
      const msg =
        successRow?.message ||
        resp?.message ||
        "DTDC cancel failed";

      await supabaseAdmin
        .from("dtdc_shipments")
        .update({
          status: "failed",
          dtdc_response: resp,
          last_error: msg,
        })
        .eq("id", shipment.id);

      return NextResponse.json({ ok: false, error: msg, resp }, { status: 400 });
    }

    // 4) Update shipment as cancelled + deactivate
    const upd = await supabaseAdmin
      .from("dtdc_shipments")
      .update({
        status: "cancelled",
        is_active: false,
        dtdc_response: resp,
        last_error: null,
      })
      .eq("id", shipment.id)
      .select("*")
      .single();

    if (upd.error) throw new Error(upd.error.message);

    return NextResponse.json({ ok: true, shipment: upd.data, resp });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Cancel shipment failed" },
      { status: 500 }
    );
  }
}
