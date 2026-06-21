import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dtdcGetTrackDetails } from "./tracking";

/**
 * Result of polling a single shipment. Used by the cron job to decide
 * whether to fire customer notifications.
 */
export type PollResult = {
  shipment_id: string;
  order_id: string;
  reference_number: string | null;
  prev_status: string;
  new_status: string;
  transitioned: boolean;
  events_added: number;
  error?: string;
};

function parseEventAt(dateStr?: string, timeStr?: string): string | null {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  const t = (timeStr ? String(timeStr).trim() : "00:00:00");
  const tryParse = (isoLike: string) => {
    const d = new Date(isoLike);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  };
  if (raw.includes("/")) {
    const [dd, mm, yyyy] = raw.split("/");
    if (dd && mm && yyyy) return tryParse(`${yyyy}-${mm}-${dd}T${t}`);
  }
  if (/^\d{8}$/.test(raw)) {
    const dd = raw.slice(0, 2);
    const mm = raw.slice(2, 4);
    const yyyy = raw.slice(4, 8);
    return tryParse(`${yyyy}-${mm}-${dd}T${t}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return tryParse(`${raw}T${t}`);
  return tryParse(`${raw} ${t}`);
}

export function mapDtdcActionToShipmentStatus(action?: string): string | null {
  const a = (action || "").toLowerCase();
  if (!a) return null;
  if (a.includes("delivered")) return "delivered";
  if (a.includes("out for delivery")) return "out_for_delivery";
  if (a.includes("in transit") || a.includes("dispatched") || a.includes("received"))
    return "in_transit";
  if (a.includes("rto")) return "rto";
  if (a.includes("pickup")) return "pickup_scheduled";
  return null;
}

/** Map a DTDC shipment status to the customer-facing `orders.status`. */
export function mapShipmentToOrderStatus(
  shipmentStatus: string | null
): string | null {
  if (!shipmentStatus) return null;
  switch (shipmentStatus) {
    case "delivered":
      return "delivered";
    case "out_for_delivery":
      return "out_for_delivery";
    case "in_transit":
    case "pickup_scheduled":
      return "shipped";
    case "rto":
    case "cancelled":
      return "returned";
    default:
      return null;
  }
}

/**
 * Poll a single DTDC shipment, persist any new events, and update the
 * shipment + order status. Idempotent — safe to call multiple times.
 */
export async function pollSingleShipment(
  admin: SupabaseClient,
  shipment: {
    id: string;
    order_id: string;
    reference_number: string | null;
    status: string;
  }
): Promise<PollResult> {
  const result: PollResult = {
    shipment_id: shipment.id,
    order_id: shipment.order_id,
    reference_number: shipment.reference_number,
    prev_status: shipment.status,
    new_status: shipment.status,
    transitioned: false,
    events_added: 0,
  };

  if (!shipment.reference_number) {
    result.error = "missing_reference_number";
    return result;
  }

  let trackJson: any;
  try {
    trackJson = await dtdcGetTrackDetails({
      trkType: "cnno",
      strcnno: String(shipment.reference_number),
      addtnlDtl: "Y",
    });
  } catch (err: any) {
    result.error = err?.message || "track_failed";
    // Still bump last_polled_at so we don't hot-loop on a failing AWB.
    await admin
      .from("dtdc_shipments")
      .update({ last_polled_at: new Date().toISOString() })
      .eq("id", shipment.id);
    return result;
  }

  const details =
    trackJson?.trackDetails ||
    trackJson?.TrackDetails ||
    trackJson?.data?.trackDetails ||
    [];

  // Insert events (dedup by composite unique index).
  let eventsAdded = 0;
  for (const ev of details) {
    const action = ev?.strAction || ev?.action || ev?.status || "";
    const origin = ev?.strOrigin || ev?.origin || "";
    const destination = ev?.strDestination || ev?.destination || "";
    const remarks = ev?.strRemarks || ev?.remarks || "";
    const status_code = ev?.strStatus || ev?.statusCode || ev?.code || "";
    const eventAtIso = parseEventAt(
      ev?.strActionDate || ev?.actionDate,
      ev?.strActionTime || ev?.actionTime
    );

    const upsertRes = await admin.from("dtdc_shipment_events").upsert(
      {
        shipment_id: shipment.id,
        event_at: eventAtIso,
        action,
        origin,
        destination,
        remarks,
        status_code,
        raw: ev,
      },
      { onConflict: "shipment_id,event_at,action" }
    );
    if (!upsertRes.error) eventsAdded += 1;
  }
  result.events_added = eventsAdded;

  // Determine the latest action and infer the new shipment status.
  const latest = details?.[0] || details?.[details.length - 1];
  const inferred = mapDtdcActionToShipmentStatus(
    latest?.strAction || latest?.action
  );
  const newShipmentStatus = inferred || shipment.status;
  const transitioned = newShipmentStatus !== shipment.status;

  // Update shipment row + bookkeeping.
  const update: Record<string, unknown> = {
    last_polled_at: new Date().toISOString(),
  };
  if (transitioned) {
    update.status = newShipmentStatus;
    update.status_last_changed_at = new Date().toISOString();
  }
  await admin.from("dtdc_shipments").update(update).eq("id", shipment.id);

  // Sync order.status if the shipment moved forward.
  if (transitioned) {
    const targetOrderStatus = mapShipmentToOrderStatus(newShipmentStatus);
    if (targetOrderStatus) {
      await admin.rpc("dtdc_apply_status_to_order", {
        p_order_id: shipment.order_id,
        p_new_status: targetOrderStatus,
      });
    }
  }

  result.new_status = newShipmentStatus;
  result.transitioned = transitioned;
  return result;
}
