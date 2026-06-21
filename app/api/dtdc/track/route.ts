import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { dtdcGetTrackDetails } from "@/lib/dtdc";

function parseEventAt(dateStr?: string, timeStr?: string): string | null {
  if (!dateStr) return null;

  // Many DTDC examples use ddMMyyyy or dd/MM/yyyy or yyyy-MM-dd (varies)
  // We'll try multiple patterns safely.
  const raw = String(dateStr).trim();
  const t = (timeStr ? String(timeStr).trim() : "00:00:00");

  const tryParse = (isoLike: string) => {
    const d = new Date(isoLike);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  };

  // dd/MM/yyyy
  if (raw.includes("/")) {
    const [dd, mm, yyyy] = raw.split("/");
    if (dd && mm && yyyy) return tryParse(`${yyyy}-${mm}-${dd}T${t}`);
  }

  // ddMMyyyy
  if (/^\d{8}$/.test(raw)) {
    const dd = raw.slice(0, 2);
    const mm = raw.slice(2, 4);
    const yyyy = raw.slice(4, 8);
    return tryParse(`${yyyy}-${mm}-${dd}T${t}`);
  }

  // yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return tryParse(`${raw}T${t}`);
  }

  // fallback
  return tryParse(`${raw} ${t}`);
}

function mapShipmentStatus(action?: string): string | null {
  const a = (action || "").toLowerCase();
  if (!a) return null;
  if (a.includes("delivered")) return "delivered";
  if (a.includes("out for delivery")) return "out_for_delivery";
  if (a.includes("in transit") || a.includes("dispatched") || a.includes("received")) return "in_transit";
  if (a.includes("rto")) return "rto";
  if (a.includes("pickup")) return "pickup_scheduled";
  return null;
}

function mapOrderStatusFromShipment(shipmentStatus?: string | null) {
  if (!shipmentStatus) return null;
  if (shipmentStatus === "delivered") return "delivered";
  if (shipmentStatus === "in_transit") return "shipped";
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const order_id = (url.searchParams.get("order_id") || "").trim();

    if (!order_id) {
      return NextResponse.json({ ok: false, error: "Missing order_id" }, { status: 400 });
    }

    // 1) Load active shipment
    const { data: shipment, error: sErr } = await supabaseAdmin
      .from("dtdc_shipments")
      .select("*")
      .eq("order_id", order_id)
      .eq("is_active", true)
      .maybeSingle();

    if (sErr) throw new Error(sErr.message);
    if (!shipment?.reference_number) {
      return NextResponse.json(
        { ok: false, error: "No active DTDC shipment/AWB found for this order" },
        { status: 404 }
      );
    }

    // 2) Call DTDC tracking (AWB/cnno)
    const trackJson = await dtdcGetTrackDetails({
      trkType: "cnno",
      strcnno: String(shipment.reference_number),
      addtnlDtl: "Y",
    });

    // 3) Extract trackDetails list (shape can vary slightly)
    const details =
      trackJson?.trackDetails ||
      trackJson?.TrackDetails ||
      trackJson?.data?.trackDetails ||
      [];

    // 4) Insert events (dedup by unique index)
    for (const ev of details) {
      const action = ev?.strAction || ev?.action || ev?.status || "";
      const origin = ev?.strOrigin || ev?.origin || "";
      const destination = ev?.strDestination || ev?.destination || "";
      const remarks = ev?.strRemarks || ev?.remarks || "";
      const status_code = ev?.strStatus || ev?.statusCode || ev?.code || "";

      const eventAtIso =
        parseEventAt(ev?.strActionDate || ev?.actionDate, ev?.strActionTime || ev?.actionTime) ||
        null;

      await supabaseAdmin.from("dtdc_shipment_events").upsert(
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
    }

    // 5) Update shipment status if we can infer from latest event
    const latest = details?.[0] || details?.[details.length - 1];
    const inferred = mapShipmentStatus(latest?.strAction || latest?.action);

    if (inferred && inferred !== shipment.status) {
      await supabaseAdmin
        .from("dtdc_shipments")
        .update({ status: inferred })
        .eq("id", shipment.id);
    }

    // 5b) Keep order status in sync with shipment progress.
    const mappedOrderStatus = mapOrderStatusFromShipment(inferred || shipment.status);
    if (mappedOrderStatus) {
      const { data: ord } = await supabaseAdmin
        .from("orders")
        .select("id,status")
        .eq("id", order_id)
        .maybeSingle();

      const current = ord?.status || null;
      const terminal = current === "delivered" || current === "cancelled" || current === "returned";

      if (!terminal && current !== mappedOrderStatus) {
        await supabaseAdmin
          .from("orders")
          .update({ status: mappedOrderStatus })
          .eq("id", order_id);

        // Dual-write: mirror the order status into MySQL (account pages read it).
        try {
          const { mirrorTableToMysql } = await import("@/lib/data/mirror");
          await mirrorTableToMysql("orders", order_id);
        } catch (e) {
          console.error("[dual-write] dtdc track order status MySQL mirror failed:", e);
        }
      }
    }

    // 6) Read events back (sorted)
    const { data: events } = await supabaseAdmin
      .from("dtdc_shipment_events")
      .select("event_at, action, origin, destination, remarks, status_code")
      .eq("shipment_id", shipment.id)
      .order("event_at", { ascending: false });

    return NextResponse.json({
      ok: true,
      awb: shipment.reference_number,
      shipment_status: inferred || shipment.status,
      raw: trackJson,
      events: events ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Tracking failed" },
      { status: 500 }
    );
  }
}
