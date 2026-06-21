import "server-only";
import { DTDC_SHIPSY } from "@/lib/dtdc"; // from step 3 (lib/dtdc/index.ts)

function mustStr(v: any, fallback = "") {
  return (v == null ? fallback : String(v)).trim();
}

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export type BuildConsignmentInput = {
  order: {
    id: string;
    order_number?: string | null;
    total?: number | null;
    currency?: string | null;
    address_snapshot?: any | null;
  };
  items: Array<{ product_id: string; quantity: number; sku?: string | null; name?: string | null }>;
  products: Record<string, { gross_weight_g?: number | null }>;
  opts?: {
    is_cod?: boolean;
    cod_amount?: number;
    service_type_id?: string;
    commodity_id?: string;
    load_type?: string; // "NON-DOCUMENT" usually
  };
};

export function buildConsignmentRequest(input: BuildConsignmentInput) {
  const snap = input.order.address_snapshot || {};

  // Destination from address_snapshot (created at checkout)
  const dest = {
    name: mustStr(snap.name || snap.full_name, "Customer"),
    phone: mustStr(snap.phone, ""),
    alternate_phone: mustStr(snap.phone, ""),
    address_line_1: mustStr(snap.address || snap.address_line_1, ""),
    address_line_2: mustStr(snap.address_line_2 || snap.address2, ""),
    pincode: mustStr(snap.pincode, ""),
    city: mustStr(snap.city, ""),
    state: mustStr(snap.state, ""),
  };

  // Pickup (single warehouse from env)
  const origin = {
    name: mustStr(process.env.DTDC_PICKUP_NAME, "Warehouse"),
    phone: mustStr(process.env.DTDC_PICKUP_PHONE, ""),
    alternate_phone: mustStr(process.env.DTDC_PICKUP_PHONE, ""),
    address_line_1: mustStr(process.env.DTDC_PICKUP_ADDRESS_LINE1, ""),
    address_line_2: mustStr(process.env.DTDC_PICKUP_ADDRESS_LINE2, ""),
    pincode: mustStr(process.env.DTDC_PICKUP_PINCODE, ""),
    city: mustStr(process.env.DTDC_PICKUP_CITY, ""),
    state: mustStr(process.env.DTDC_PICKUP_STATE, ""),
  };

  const isCod = !!input.opts?.is_cod;
  const orderTotal = num(input.order.total, 0);

  // Weight in KG from products.gross_weight_g × qty (retail-packaged
  // weight is what actually goes into the DTDC consignment box).
  let totalG = 0;
  for (const it of input.items) {
    const w = num(input.products[it.product_id]?.gross_weight_g, 0);
    totalG += w * num(it.quantity, 0);
  }
  const weightKg = Math.max(totalG / 1000, 0.1); // keep >= 0.1kg

  // Default dimensions (cm)
  const L = num(process.env.DTDC_DEFAULT_LENGTH_CM, 10);
  const W = num(process.env.DTDC_DEFAULT_WIDTH_CM, 10);
  const H = num(process.env.DTDC_DEFAULT_HEIGHT_CM, 10);

  const serviceTypeId = input.opts?.service_type_id || DTDC_SHIPSY.defaultServiceTypeId;
  const commodityId = input.opts?.commodity_id || DTDC_SHIPSY.defaultCommodityId;
  const loadType = input.opts?.load_type || DTDC_SHIPSY.defaultLoadType || "NON-DOCUMENT";

  const customerRef = input.order.order_number || input.order.id;

  // Minimal consignment body per DTDC doc structure
  const consignment: any = {
    customer_code: DTDC_SHIPSY.customerCode,
    service_type_id: serviceTypeId,
    load_type: loadType,                    // e.g. "NON-DOCUMENT"
    description: `Order ${customerRef}`,
    dimension_unit: "cm",
    length: String(L),
    width: String(W),
    height: String(H),
    weight_unit: "kg",
    weight: String(weightKg.toFixed(3)),
    declared_value: String(orderTotal),
    num_pieces: "1",
    commodity_id: String(commodityId),
    is_risk_surcharge_applicable: false,
    customer_reference_number: String(customerRef),
    origin_details: origin,
    destination_details: dest,
  };

  // COD fields only if COD
  if (isCod) {
    const codAmount = num(input.opts?.cod_amount, orderTotal);
    consignment.cod_collection_mode = "CASH";
    consignment.cod_amount = String(codAmount.toFixed(2));
  }

  return {
    consignments: [consignment],
  };
}
