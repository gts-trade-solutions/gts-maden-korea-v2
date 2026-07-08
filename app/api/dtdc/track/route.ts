import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { randomUUID } from "node:crypto";
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
    const shipment = await prisma.dtdc_shipments.findFirst({
      where: { order_id, is_active: true },
    });

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
      const eventAt = eventAtIso ? new Date(eventAtIso) : null;

      // Manual upsert on the (shipment_id, event_at, action) dedup key.
      // event_at can be null, which a compound-unique upsert can't express,
      // so we find-then-create/update to preserve the old onConflict behavior.
      const existing = await prisma.dtdc_shipment_events.findFirst({
        where: { shipment_id: shipment.id, event_at: eventAt, action },
        select: { id: true },
      });
      if (existing) {
        await prisma.dtdc_shipment_events.update({
          where: { id: existing.id },
          data: { origin, destination, remarks, status_code, raw: ev },
        });
      } else {
        await prisma.dtdc_shipment_events.create({
          data: {
            id: randomUUID(),
            shipment_id: shipment.id,
            event_at: eventAt,
            action,
            origin,
            destination,
            remarks,
            status_code,
            raw: ev,
          },
        });
      }
    }

    // 5) Update shipment status if we can infer from latest event
    const latest = details?.[0] || details?.[details.length - 1];
    const inferred = mapShipmentStatus(latest?.strAction || latest?.action);

    if (inferred && inferred !== shipment.status) {
      await prisma.dtdc_shipments.updateMany({
        where: { id: shipment.id },
        data: { status: inferred },
      });
    }

    // 5b) Keep order status in sync with shipment progress.
    const mappedOrderStatus = mapOrderStatusFromShipment(inferred || shipment.status);
    if (mappedOrderStatus) {
      const ord = await prisma.orders.findFirst({
        where: { id: order_id },
        select: { id: true, status: true },
      });

      const current = ord?.status || null;
      const terminal = current === "delivered" || current === "cancelled" || current === "returned";

      if (!terminal && current !== mappedOrderStatus) {
        // Writes MySQL directly (authoritative for account pages), so the old
        // Supabase→MySQL dual-write mirror is no longer needed.
        await prisma.orders.updateMany({
          where: { id: order_id },
          data: { status: mappedOrderStatus },
        });
      }
    }

    // 6) Read events back (sorted)
    const events = await prisma.dtdc_shipment_events.findMany({
      where: { shipment_id: shipment.id },
      select: {
        event_at: true,
        action: true,
        origin: true,
        destination: true,
        remarks: true,
        status_code: true,
      },
      orderBy: { event_at: "desc" },
    });

    return NextResponse.json({
      ok: true,
      awb: shipment.reference_number,
      shipment_status: inferred || shipment.status,
      raw: trackJson,
      events: jsonSafe(events) ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Tracking failed" },
      { status: 500 }
    );
  }
}
