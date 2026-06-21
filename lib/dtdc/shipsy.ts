import "server-only";
import { DTDC_SHIPSY } from "./env";
import { logDtdcApi } from "./logger";

async function shipsyFetch<T>(
  api_name: "create" | "label" | "cancel",
  path: string,
  init: RequestInit & { shipment_id?: string | null; requestBody?: any } = {}
): Promise<{ data: T; status: number; headers: Headers }> {
  const url = `${DTDC_SHIPSY.baseUrl}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set("api-key", DTDC_SHIPSY.apiKey);

  // Always send JSON unless caller overrides
  if (init.body && !headers.get("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const status = res.status;

  // Label API can return binary PDF or base64 string → we handle separately below.
  let json: any = null;
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    json = await res.json().catch(() => null);
  } else {
    // Some errors may still return text
    const txt = await res.text().catch(() => "");
    json = txt ? { raw: txt } : null;
  }

  await logDtdcApi({
    shipment_id: init.shipment_id ?? null,
    api_name,
    endpoint: url,
    request: init.requestBody ?? null,
    response: json,
    http_status: status,
    success: res.ok,
  });

  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error ||
      json?.raw ||
      `DTDC Shipsy API error (${status}) at ${path}`;
    throw new Error(msg);
  }

  return { data: json as T, status, headers: res.headers };
}

/** 1) Create shipment (Order Upload / softdata) */
export async function dtdcCreateConsignment(
  body: any,
  shipment_id?: string | null
) {
  // body must follow docs: { consignments: [...] }
  return shipsyFetch<any>("create", "/api/customer/integration/consignment/softdata", {
    method: "POST",
    body: JSON.stringify(body),
    shipment_id,
    requestBody: body,
  }).then((r) => r.data);
}

/** 2) Label stream: returns PDF bytes (or base64 response depending on label_format) */
export async function dtdcGetLabel(
  params: {
    reference_number: string;
    label_code: string;
    label_format?: "pdf" | "base64";
  },
  shipment_id?: string | null
): Promise<{ contentType: string; bytes: ArrayBuffer }> {
  const q = new URLSearchParams({
    reference_number: params.reference_number,
    label_code: params.label_code,
    ...(params.label_format ? { label_format: params.label_format } : {}),
  });

  const urlPath = `/api/customer/integration/consignment/shippinglabel/stream?${q.toString()}`;
  const url = `${DTDC_SHIPSY.baseUrl}${urlPath}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "api-key": DTDC_SHIPSY.apiKey },
    cache: "no-store",
  });

  const contentType = res.headers.get("content-type") || "application/pdf";

  // For logging, avoid storing full PDF bytes
  await logDtdcApi({
    shipment_id: shipment_id ?? null,
    api_name: "label",
    endpoint: url,
    request: { ...params },
    response: { contentType, ok: res.ok },
    http_status: res.status,
    success: res.ok,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `DTDC label fetch failed (${res.status})`);
  }

  const bytes = await res.arrayBuffer();
  return { contentType, bytes };
}

/** 3) Cancel shipment */
export async function dtdcCancelConsignment(
  body: { AWBNo: string[]; customerCode: string },
  shipment_id?: string | null
) {
  return shipsyFetch<any>("cancel", "/api/customer/integration/consignment/cancel", {
    method: "POST",
    body: JSON.stringify(body),
    shipment_id,
    requestBody: body,
  }).then((r) => r.data);
}
