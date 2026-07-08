import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
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
      shipment = await prisma.dtdc_shipments.findFirst({
        where: { id: shipment_id },
      });
    } else {
      shipment = await prisma.dtdc_shipments.findFirst({
        where: { order_id, is_active: true },
      });
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
    await prisma.dtdc_shipments.updateMany({
      where: { id: shipment.id },
      data: {
        last_label_code: label_code,
        last_label_format: label_format,
        label_last_generated_at: new Date(),
        status: shipment.status === "created" ? "label_generated" : shipment.status,
      },
    });

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
