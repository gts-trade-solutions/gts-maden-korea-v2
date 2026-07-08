import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { createDtdcShipmentForOrder } from "@/lib/dtdc/createShipmentForOrder";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const order_id = String(body?.order_id || "").trim();
    const force_new = !!body?.force_new;

    if (!order_id) {
      return NextResponse.json({ ok: false, error: "Missing order_id" }, { status: 400 });
    }

    // 1. Check if an active shipment already exists for this order
    const existingShipment = await prisma.dtdc_shipments.findFirst({
      where: { order_id, is_active: true },
    });

    // 2. If active shipment exists and we're not forcing a new one, reuse it
    if (existingShipment && !force_new) {
      return NextResponse.json({ ok: true, shipment: jsonSafe(existingShipment), reused: true });
    }

    // 3. If we're forcing a new shipment, deactivate the existing active shipment
    if (existingShipment && force_new) {
      await prisma.dtdc_shipments.updateMany({
        where: { id: existingShipment.id },
        data: { is_active: false, status: "failed", last_error: "Recreated by admin" },
      });
    }

    // 4. Proceed to create a new shipment
    const result = await createDtdcShipmentForOrder(prisma, order_id, {
      mode: "test",
      force_new,
      is_cod: !!body?.is_cod,
      cod_amount: body?.cod_amount ? Number(body.cod_amount) : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    // Log the error in detail
    console.error("Error during shipment creation: ", e);

    // Return a detailed error response
    return NextResponse.json(
      { ok: false, error: e?.message || JSON.stringify(e) || "Failed to create DTDC shipment" },
      { status: 500 }
    );
  }
}
