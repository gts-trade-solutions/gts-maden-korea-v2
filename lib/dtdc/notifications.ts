import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/ses";
import { sendWhatsAppTemplate } from "@/lib/whatsappMeta";

/**
 * v1 customer notifications on DTDC status transitions.
 *
 *   shipped           → "Your order has shipped"
 *   out_for_delivery  → "Out for delivery"
 *   delivered         → "Delivered — thank you"
 *
 * Transitions of any other type (pickup_scheduled, rto, cancelled,
 * returned) do not fire a customer notification in v1 — admin-side
 * concerns. WhatsApp is gated by `DTDC_NOTIFY_VIA_WHATSAPP=true`.
 */

const SUPPORT_EMAIL = "info@madenkorea.com";
const STORE_NAME = "MadenKorea";
const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://madenkorea.com").replace(
    /\/$/,
    ""
  );

const WA_TEMPLATES = {
  shipped: process.env.WA_TPL_SHIPPED || "order_shipped",
  out_for_delivery:
    process.env.WA_TPL_OUT_FOR_DELIVERY || "order_out_for_delivery",
  delivered: process.env.WA_TPL_DELIVERED || "order_delivered",
};
const WA_LANG = process.env.WA_TPL_LANGUAGE || "en";

type Transition = "shipped" | "out_for_delivery" | "delivered";

function isTransitionOfInterest(
  prev: string,
  next: string
): Transition | null {
  if (next === prev) return null;
  if (next === "delivered") return "delivered";
  if (next === "out_for_delivery") return "out_for_delivery";
  if (
    next === "in_transit" ||
    next === "pickup_scheduled" ||
    next === "shipped"
  ) {
    // Only notify the first time the order is on its way; treat any
    // forward movement from the pre-shipping statuses as 'shipped'.
    return "shipped";
  }
  return null;
}

function fmtSubject(transition: Transition, orderNumber: string | null): string {
  const ord = orderNumber ? `#${orderNumber}` : "";
  switch (transition) {
    case "shipped":
      return `Your ${STORE_NAME} order ${ord} has shipped`;
    case "out_for_delivery":
      return `Your ${STORE_NAME} order ${ord} is out for delivery`;
    case "delivered":
      return `Your ${STORE_NAME} order ${ord} has been delivered`;
  }
}

function fmtHtml(
  transition: Transition,
  orderNumber: string | null,
  awb: string | null,
  customerName: string | null
): string {
  const ord = orderNumber ?? "your order";
  const greet = customerName ? `Hi ${customerName},` : "Hi there,";
  const ordersUrl = `${SITE_URL}/account/orders`;
  const awbLine = awb
    ? `<p style="color:#555;font-size:14px">Tracking number (AWB): <strong>${awb}</strong></p>`
    : "";

  const body = (() => {
    switch (transition) {
      case "shipped":
        return `<p>Good news — your order <strong>#${ord}</strong> has just shipped with DTDC.</p>${awbLine}<p>You can follow updates from your <a href="${ordersUrl}" style="color:#dc2626">orders page</a>.</p>`;
      case "out_for_delivery":
        return `<p>Your order <strong>#${ord}</strong> is out for delivery today.</p>${awbLine}<p>Please keep your phone handy — the courier may call to confirm your address.</p>`;
      case "delivered":
        return `<p>Your order <strong>#${ord}</strong> has been delivered. Thank you for shopping with ${STORE_NAME}!</p>${awbLine}<p>If anything's wrong, reply to this email or write to us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`;
    }
  })();

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 16px">${fmtSubject(transition, orderNumber).replace(`Your ${STORE_NAME} `, "")}</h2>
      <p>${greet}</p>
      ${body}
      <p style="margin-top:32px;color:#888;font-size:12px">
        ${STORE_NAME} · <a href="${SITE_URL}" style="color:#888">${SITE_URL.replace(/^https?:\/\//, "")}</a>
      </p>
    </div>
  `;
}

export type NotifyResult = {
  email?: { ok: boolean; error?: string };
  whatsapp?: { ok: boolean; error?: string };
  skipped?: string;
};

/**
 * Fire a customer notification for the given transition. Best-effort —
 * any thrown errors are caught and returned in the result rather than
 * propagating into the cron loop.
 */
export async function notifyTransition(
  admin: SupabaseClient,
  args: {
    order_id: string;
    awb: string | null;
    prev_status: string;
    new_status: string;
  }
): Promise<NotifyResult> {
  const transition = isTransitionOfInterest(args.prev_status, args.new_status);
  if (!transition) return { skipped: "not_of_interest" };

  // Pull the customer's contact info from the order's address snapshot.
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, address_snapshot")
    .eq("id", args.order_id)
    .maybeSingle();

  if (!order) return { skipped: "order_not_found" };

  const snap: any = order.address_snapshot || {};
  const customerName: string | null = snap.name ?? null;
  const customerEmail: string | null = snap.email ?? null;
  const customerPhone: string | null = snap.phone ?? null;
  const orderNumber = order.order_number ?? null;

  const out: NotifyResult = {};

  if (customerEmail) {
    try {
      await sendEmail({
        to: customerEmail,
        subject: fmtSubject(transition, orderNumber),
        html: fmtHtml(transition, orderNumber, args.awb, customerName),
      });
      out.email = { ok: true };
    } catch (e: any) {
      out.email = { ok: false, error: e?.message || "send_failed" };
    }
  }

  if (process.env.DTDC_NOTIFY_VIA_WHATSAPP === "true" && customerPhone) {
    try {
      const tpl = WA_TEMPLATES[transition];
      // Variables: {{1}} customer first name, {{2}} order number, {{3}} AWB
      const first = (customerName || "").split(" ")[0] || "there";
      const r = await sendWhatsAppTemplate({
        toPhone: customerPhone,
        templateName: tpl,
        languageCode: WA_LANG,
        bodyVariables: [
          first,
          orderNumber || "",
          args.awb || "",
        ],
      });
      out.whatsapp = r.success
        ? { ok: true }
        : { ok: false, error: r.error };
    } catch (e: any) {
      out.whatsapp = { ok: false, error: e?.message || "wa_send_failed" };
    }
  }

  return out;
}
