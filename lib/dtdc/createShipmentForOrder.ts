import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  admin: SupabaseClient,
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
  const { data: order, error: oErr } = await admin
    .from("orders")
    .select("id, order_number, status, total, currency, address_snapshot")
    .eq("id", orderId)
    .maybeSingle();

  if (oErr || !order) throw new Error(oErr?.message || "Order not found");

  // Allow create only if paid/processing (adjust if needed)
  if (!["paid", "processing", "shipped", "dispatched"].includes(order.status)) {
    throw new Error(`Order status not eligible for shipment: ${order.status}`);
  }

  // 2) Load items
  const { data: items, error: iErr } = await admin
    .from("order_items")
    .select("product_id, quantity, sku, name")
    .eq("order_id", orderId);

  if (iErr) throw new Error(iErr.message);

  const ids = Array.from(
    new Set((items ?? []).map((x) => x.product_id).filter(Boolean))
  );

  // 3) Load product weights — gross (with retail packaging), since
  //    that's what actually goes into the DTDC consignment box.
  const { data: prods, error: pErr } = await admin
    .from("products")
    .select("id, gross_weight_g")
    .in("id", ids);

  if (pErr) throw new Error(pErr.message);

  const productMap: Record<string, { gross_weight_g?: number | null }> = {};
  (prods ?? []).forEach((p: any) => {
    productMap[p.id] = { gross_weight_g: p.gross_weight_g ?? null };
  });

  // 4) Find existing active shipment
  const { data: active } = await admin
    .from("dtdc_shipments")
    .select("*")
    .eq("order_id", orderId)
    .eq("is_active", true)
    .maybeSingle();

  // If active exists:
  // - force_new=false -> reuse same row (even if reference_number is null)
  // - force_new=true  -> deactivate it and create a fresh draft
  if (active?.id && opts.force_new) {
    await admin
      .from("dtdc_shipments")
      .update({
        is_active: false,
        status: "failed",
        last_error: "Recreated by admin",
      })
      .eq("id", active.id);
  }

  // If reusing active row (force_new=false)
  let shipment = active?.id && !opts.force_new ? active : null;
  const reused = !!(active?.id && !opts.force_new);

  // 5) Create a new draft shipment row if needed
  if (!shipment) {
    const insertDraft = await admin
      .from("dtdc_shipments")
      .insert({
        order_id: orderId,
        customer_code: DTDC_SHIPSY.customerCode,
        status: "draft",
        is_active: true,
        service_type_id: DTDC_SHIPSY.defaultServiceTypeId,
        commodity_id: DTDC_SHIPSY.defaultCommodityId,
        load_type: DTDC_SHIPSY.defaultLoadType,
        is_cod: !!opts.is_cod,
        cod_amount: opts.is_cod ? opts.cod_amount ?? order.total ?? null : null,
      })
      .select("*")
      .single();

    if (insertDraft.error) throw new Error(insertDraft.error.message);
    shipment = insertDraft.data;
  } else {
    // Ensure reused row stays active and is in draft-like state for retry
    await admin
      .from("dtdc_shipments")
      .update({
        is_active: true,
        status: shipment.status === "created" ? shipment.status : "draft",
      })
      .eq("id", shipment.id);
  }

  // 6) Build request payload (even in test mode we store it for debugging)
  const requestBody = buildConsignmentRequest({
    order,
    items: (items ?? []) as any,
    products: productMap,
    opts: {
      is_cod: !!opts.is_cod,
      cod_amount: opts.cod_amount,
    },
  });

  await admin
    .from("dtdc_shipments")
    .update({ dtdc_request: requestBody })
    .eq("id", shipment.id);

  // 7) TEST MODE: do not call DTDC; generate mock AWB and mark as created
  if (isTest) {
    // If already has reference_number, just return it
    if (shipment.reference_number) {
      return { shipment, reused: true };
    }

    const mockRef = `TEST-${order.order_number || order.id}-${Date.now()}`;
    const mockResp = {
      test: true,
      message: "Test shipment created locally (no DTDC call).",
      reference_number: mockRef,
      created_at: new Date().toISOString(),
    };

    const upd = await admin
      .from("dtdc_shipments")
      .update({
        status: "created",
        reference_number: mockRef,
        dtdc_response: mockResp,
        last_error: null,
      })
      .eq("id", shipment.id)
      .select("*")
      .single();

    if (upd.error) throw new Error(upd.error.message);
    return { shipment: upd.data, reused };
  }

  // 8) REAL MODE: Call DTDC create consignment
  try {
    const resp = await dtdcCreateConsignment(requestBody, shipment.id);

    const ok = resp?.data?.[0]?.success !== false;
    const reference = extractReferenceNumber(resp);

    if (!ok || !reference) {
      const msg =
        resp?.data?.[0]?.message || resp?.message || "DTDC create failed";

      await admin
        .from("dtdc_shipments")
        .update({
          status: "failed",
          dtdc_response: resp,
          last_error: msg,
          // keep is_active=true so user can retry without duplicate inserts
          is_active: true,
        })
        .eq("id", shipment.id);

      throw new Error(msg);
    }

    const upd = await admin
      .from("dtdc_shipments")
      .update({
        status: "created",
        reference_number: reference,
        dtdc_response: resp,
        last_error: null,
        is_active: true,
      })
      .eq("id", shipment.id)
      .select("*")
      .single();

    if (upd.error) throw new Error(upd.error.message);

    return { shipment: upd.data, reused };
  } catch (e: any) {
    const msg = errToString(e);

    // Also store readable error
    await admin
      .from("dtdc_shipments")
      .update({
        status: "failed",
        last_error: msg,
        is_active: true, // keep active for retry without duplicates
      })
      .eq("id", shipment.id);

    throw new Error(msg);
  }
}
