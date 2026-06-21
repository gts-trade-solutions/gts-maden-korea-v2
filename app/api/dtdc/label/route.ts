import { NextRequest } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { dtdcGetLabel } from "@/lib/dtdc";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const order_id = (url.searchParams.get("order_id") || "").trim();
    const shipment_id = (url.searchParams.get("shipment_id") || "").trim();

    const label_code = (url.searchParams.get("label_code") || "SHIP_LABEL_4X6").trim();
    const label_format = (url.searchParams.get("label_format") || "pdf").trim() as
      | "pdf"
      | "base64";

    if (!order_id && !shipment_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing order_id or shipment_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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

    if (!shipment?.id) throw new Error("DTDC shipment not found. Create shipment first.");
    if (!shipment?.reference_number) throw new Error("Missing reference_number (AWB). Create shipment first.");

    // 2) Fetch label bytes from DTDC
    const { contentType, bytes } = await dtdcGetLabel(
      {
        reference_number: shipment.reference_number,
        label_code,
        label_format,
      },
      shipment.id
    );

    // 3) Update DB: mark label generated + store last label details
    await supabaseAdmin
      .from("dtdc_shipments")
      .update({
        last_label_code: label_code,
        last_label_format: label_format,
        label_last_generated_at: new Date().toISOString(),
        status: shipment.status === "created" ? "label_generated" : shipment.status,
      })
      .eq("id", shipment.id);

    // 4) Return PDF stream
    const isPdf = label_format === "pdf" || contentType.includes("pdf");
    const filename = `DTDC_${shipment.reference_number}_${label_code}.${isPdf ? "pdf" : "bin"}`;

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": isPdf ? "application/pdf" : contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || "Label generation failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
