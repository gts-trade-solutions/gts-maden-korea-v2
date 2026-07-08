import "server-only";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { randomUUID } from "node:crypto";
import { dtdcCreateConsignment, DTDC_SHIPSY } from "@/lib/dtdc";
import { buildConsignmentRequest } from "@/lib/dtdc/buildConsignmentRequest";

type CreateOpts = {
  mode: "auto" | "admin" | "test";
  force_new?: boolean;
  is_cod?: boolean;
  cod_amount?: number;
};

function extractReferenceNumber(resp: any): string | null {
  return (
    resp?.data?.[0]?.pieces?.[0]?.reference_number ||
    resp?.data?.[0]?.reference_number ||
    resp?.reference_number ||
    null
  );
}

function errToString(e: any) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export async function createDtdcShipmentForOrder(
  admin: any,
  orderId: string,
  opts: CreateOpts
) {
  const isTest = opts.mode === "test";

  // Only enforce Shipsy env in non-test mode
  if (!isTest) {
    if (!process.env.DTDC_SHIPSY_API_KEY || !process.env.DTDC_SHIPSY_BASE_URL) {
      throw new Error(
        "DTDC Shipsy env not configured (DTDC_SHIPSY_API_KEY / DTDC_SHIPSY_BASE_URL)."
      );
    }
  }

  // 1) Load order
  const order = await prisma.orders.findFirst({
    where: { id: orderId },
    select: {
      id: true,
      order_number: true,
      status: true,
      total: true,
      currency: true,
      address_snapshot: true,
    },
  });

  if (!order) throw new Error("Order not found");

  // Allow create only if paid/processing (adjust if needed)
  if (!["paid", "processing", "shipped", "dispatched"].includes(order.status)) {
    throw new Error(`Order status not eligible for shipment: ${order.status}`);
  }

  // 2) Load items
  const items = await prisma.order_items.findMany({
    where: { order_id: orderId },
    select: { product_id: true, quantity: true, sku: true, name: true },
  });

  const ids = Array.from(
    new Set((items ?? []).map((x) => x.product_id).filter(Boolean))
  ) as string[];

  // 3) Load product weights — gross (with retail packaging), since
  //    that's what actually goes into the DTDC consignment box.
  const prods = await prisma.products.findMany({
    where: { id: { in: ids } },
    select: { id: true, gross_weight_g: true },
  });

  const productMap: Record<string, { gross_weight_g?: number | null }> = {};
  (prods ?? []).forEach((p: any) => {
    productMap[p.id] = {
      gross_weight_g: p.gross_weight_g == null ? null : Number(p.gross_weight_g),
    };
  });

  // Plain, JSON-friendly copy of the order for the request builder (Decimal → number).
  const orderForBuild = jsonSafe(order) as any;

  // 4) Find existing active shipment
  const active = await prisma.dtdc_shipments.findFirst({
    where: { order_id: orderId, is_active: true },
  });

  // If active exists:
  // - force_new=false -> reuse same row (even if reference_number is null)
  // - force_new=true  -> deactivate it and create a fresh draft
  if (active?.id && opts.force_new) {
    await prisma.dtdc_shipments.updateMany({
      where: { id: active.id },
      data: {
        is_active: false,
        status: "failed",
        last_error: "Recreated by admin",
      },
    });
  }

  // If reusing active row (force_new=false)
  let shipment: any = active?.id && !opts.force_new ? active : null;
  const reused = !!(active?.id && !opts.force_new);

  // 5) Create a new draft shipment row if needed
  if (!shipment) {
    shipment = await prisma.dtdc_shipments.create({
      data: {
        id: randomUUID(),
        order_id: orderId,
        customer_code: DTDC_SHIPSY.customerCode,
        status: "draft",
        is_active: true,
        service_type_id: DTDC_SHIPSY.defaultServiceTypeId,
        commodity_id: DTDC_SHIPSY.defaultCommodityId,
        load_type: DTDC_SHIPSY.defaultLoadType,
        is_cod: !!opts.is_cod,
        cod_amount: opts.is_cod ? opts.cod_amount ?? order.total ?? null : null,
      },
    });
  } else {
    // Ensure reused row stays active and is in draft-like state for retry
    await prisma.dtdc_shipments.updateMany({
      where: { id: shipment.id },
      data: {
        is_active: true,
        status: shipment.status === "created" ? shipment.status : "draft",
      },
    });
  }

  // 6) Build request payload (even in test mode we store it for debugging)
  const requestBody = buildConsignmentRequest({
    order: orderForBuild,
    items: (items ?? []) as any,
    products: productMap,
    opts: {
      is_cod: !!opts.is_cod,
      cod_amount: opts.cod_amount,
    },
  });

  await prisma.dtdc_shipments.updateMany({
    where: { id: shipment.id },
    data: { dtdc_request: requestBody as any },
  });

  // 7) TEST MODE: do not call DTDC; generate mock AWB and mark as created
  if (isTest) {
    // If already has reference_number, just return it
    if (shipment.reference_number) {
      return { shipment: jsonSafe(shipment), reused: true };
    }

    const mockRef = `TEST-${order.order_number || order.id}-${Date.now()}`;
    const mockResp = {
      test: true,
      message: "Test shipment created locally (no DTDC call).",
      reference_number: mockRef,
      created_at: new Date().toISOString(),
    };

    const upd = await prisma.dtdc_shipments.update({
      where: { id: shipment.id },
      data: {
        status: "created",
        reference_number: mockRef,
        dtdc_response: mockResp as any,
        last_error: null,
      },
    });

    return { shipment: jsonSafe(upd), reused };
  }

  // 8) REAL MODE: Call DTDC create consignment
  try {
    const resp = await dtdcCreateConsignment(requestBody, shipment.id);

    const ok = resp?.data?.[0]?.success !== false;
    const reference = extractReferenceNumber(resp);

    if (!ok || !reference) {
      const msg =
        resp?.data?.[0]?.message || resp?.message || "DTDC create failed";

      await prisma.dtdc_shipments.updateMany({
        where: { id: shipment.id },
        data: {
          status: "failed",
          dtdc_response: resp as any,
          last_error: msg,
          // keep is_active=true so user can retry without duplicate inserts
          is_active: true,
        },
      });

      throw new Error(msg);
    }

    const upd = await prisma.dtdc_shipments.update({
      where: { id: shipment.id },
      data: {
        status: "created",
        reference_number: reference,
        dtdc_response: resp as any,
        last_error: null,
        is_active: true,
      },
    });

    return { shipment: jsonSafe(upd), reused };
  } catch (e: any) {
    const msg = errToString(e);

    // Also store readable error
    await prisma.dtdc_shipments.updateMany({
      where: { id: shipment.id },
      data: {
        status: "failed",
        last_error: msg,
        is_active: true, // keep active for retry without duplicates
      },
    });

    throw new Error(msg);
  }
}
