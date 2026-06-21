import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getRouteUser } from "@/lib/auth/routeUser";
import { sendEmail } from "@/lib/ses";
import { getBusinessInfo } from "@/lib/businessInfo";
import { FALLBACK_RATES, formatPrice, isSupportedCurrency } from "@/lib/currency";
import { getEmailTranslator } from "@/lib/i18n/email";
import { getAdminRecipientEmails } from "@/lib/notificationRecipients";
import { createAdminNotification } from "@/lib/admin/notifications";

// International order request endpoint.
//
// Non-Indian visitors can't checkout via Razorpay (no shipping
// integration, no GST, no INR billing setup). Instead, they submit a
// structured cart-plus-address request from the cart page. We persist
// it to `international_orders`, email the team a styled summary, and
// email the customer an acknowledgement.
//
// Auth: optional. Signed-in customers get their `user_id` linked to
// the request; anonymous visitors can submit too.

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type CartLine = {
  product_id: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unit_price_inr: number;
  line_total_inr: number;
  hero_image_url?: string | null;
};

type Address = {
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postal_code: string;
  country: string;
};

type RequestBody = {
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  country: string;
  address: Address;
  cart: CartLine[];
  currency_code: string;
  display_total: number;  // total in the customer's currency
  inr_total: number;      // total in INR
  notes?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTeamEmail(req: RequestBody, requestId: string): string {
  const rate = isSupportedCurrency(req.currency_code)
    ? FALLBACK_RATES[req.currency_code]
    : FALLBACK_RATES.INR;
  const lineRows = req.cart
    .map(
      (l) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">
            ${escapeHtml(l.name)}${l.sku ? ` <span style="color:#888">(${escapeHtml(l.sku)})</span>` : ""}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${l.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${formatPrice(l.unit_price_inr, rate)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${formatPrice(l.line_total_inr ?? l.unit_price_inr * l.quantity, rate)}</td>
        </tr>`
    )
    .join("");

  const addr = req.address;
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111">
      <h1 style="font-size:20px;margin:0 0 4px">New international order request</h1>
      <p style="color:#666;margin:0 0 24px">Request <code>${escapeHtml(requestId)}</code> · ${escapeHtml(req.country)}</p>

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin:24px 0 8px">Customer</h2>
      <p style="margin:0 0 4px"><strong>${escapeHtml(req.customer_name)}</strong></p>
      <p style="margin:0 0 4px">${escapeHtml(req.customer_email)}</p>
      ${req.customer_phone ? `<p style="margin:0 0 4px">${escapeHtml(req.customer_phone)}</p>` : ""}

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin:24px 0 8px">Shipping address</h2>
      <p style="margin:0;white-space:pre-line">${escapeHtml(addr.line1)}${addr.line2 ? `\n${escapeHtml(addr.line2)}` : ""}\n${escapeHtml(addr.city)}${addr.state ? `, ${escapeHtml(addr.state)}` : ""} ${escapeHtml(addr.postal_code)}\n${escapeHtml(addr.country)}</p>

      <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin:24px 0 8px">Cart</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f8f8f8;text-align:left">
            <th style="padding:8px 12px;border-bottom:1px solid #ddd">Item</th>
            <th style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:center">Qty</th>
            <th style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:right">Unit</th>
            <th style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${lineRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:12px;text-align:right;font-weight:600">Customer currency</td>
            <td style="padding:12px;text-align:right;font-weight:600">${formatPrice(req.inr_total, rate)}</td>
          </tr>
          <tr>
            <td colspan="3" style="padding:0 12px 12px;text-align:right;color:#666">INR equivalent</td>
            <td style="padding:0 12px 12px;text-align:right;color:#666">₹${req.inr_total.toLocaleString("en-IN")}</td>
          </tr>
        </tfoot>
      </table>

      ${req.notes ? `<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.1em;color:#666;margin:24px 0 8px">Notes</h2><p style="margin:0;white-space:pre-line">${escapeHtml(req.notes)}</p>` : ""}

      <p style="margin:32px 0 0;padding:12px;background:#fff8e1;border:1px solid #ffd54f;border-radius:6px;font-size:13px;color:#5a4500">
        Reply to ${escapeHtml(req.customer_email)} with a shipping quote and payment instructions.
      </p>
    </div>
  `;
}

type CustomerEmailStrings = {
  subject: string;
  heading: string;
  intro: string;
  needHelpHeading: string;
  needHelpBody: string;
  signoff: string;
};

function buildCustomerEmail(
  req: RequestBody,
  requestId: string,
  t: CustomerEmailStrings
): string {
  const firstName = escapeHtml(req.customer_name.split(" ")[0] || "there");
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(t.heading.replace("{name}", firstName))}</h1>
      <p style="margin:0 0 16px;color:#444">
        ${escapeHtml(t.intro.replace("{country}", escapeHtml(req.country)))}
      </p>
      <p style="margin:0 0 8px;color:#444;font-size:13px">
        <strong>Reference:</strong> <code>${escapeHtml(requestId)}</code>
      </p>
      <p style="margin:16px 0 6px;color:#111;font-size:14px"><strong>${escapeHtml(t.needHelpHeading)}</strong></p>
      <p style="margin:0 0 16px;color:#444">${escapeHtml(t.needHelpBody)}</p>
      <p style="margin:24px 0 0;color:#888;font-size:13px">
        — ${escapeHtml(t.signoff)}
      </p>
    </div>
  `;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Minimal validation. Frontend modal also validates; this is the
  // defensive backstop for direct POSTs / bots.
  if (
    !body.customer_name ||
    !body.customer_email ||
    !body.country ||
    !body.address?.line1 ||
    !body.address?.city ||
    !body.address?.postal_code ||
    !body.address?.country ||
    !Array.isArray(body.cart) ||
    body.cart.length === 0 ||
    !body.currency_code ||
    !Number.isFinite(body.inr_total) ||
    !Number.isFinite(body.display_total)
  ) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // Link signed-in customer if present.
  let userId: string | null = null;
  try {
    userId = (await getRouteUser(req))?.id ?? null;
  } catch {
    // anonymous OK
  }

  // Persist request. RLS allows anon INSERT.
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("international_orders")
    .insert({
      status: "new",
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      customer_phone: body.customer_phone ?? null,
      country: body.country,
      address: body.address,
      cart_snapshot: body.cart,
      currency_code: body.currency_code,
      display_total: body.display_total,
      inr_total: body.inr_total,
      notes: body.notes ?? null,
      user_id: userId,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { ok: false, error: insertError?.message ?? "insert_failed" },
      { status: 500 }
    );
  }

  // Admin bell notification (separate from the email notification —
  // bell is for in-app, email is for off-hours awareness).
  void createAdminNotification({
    type: "intl_order_requested",
    title: `International order request — ${body.country}`,
    body: `${body.customer_name}${body.customer_email ? ` · ${body.customer_email}` : ""}`,
    link: "/admin/international-orders",
    severity: "info",
    meta: { request_id: inserted.id, country: body.country },
  });

  // Notify team + ack customer. Both failures are non-fatal — the
  // request is already saved and admin can see it at
  // /admin/international-orders. Email errors are returned as warnings
  // so the client can soften the success toast if needed.
  // Pass the customer's country so the support email/phone in the
  // notification + acknowledgement render any per-country override.
  const business = await getBusinessInfo(body.country);
  const emailErrors: string[] = [];

  // Admin/team notification: list is admin-managed at
  // /admin/settings/notification-emails. Falls back to the business
  // support email if the recipients table is empty, so a freshly
  // installed environment still notifies someone.
  const adminRecipients = await getAdminRecipientEmails();
  const teamTo =
    adminRecipients[0] || business.supportEmail || "info@madenkorea.com";
  const teamCc = adminRecipients.slice(1);

  try {
    await sendEmail({
      to: teamTo,
      cc: teamCc.length > 0 ? teamCc : undefined,
      subject: `[International Order Request] ${body.country} · ${body.customer_name}`,
      html: buildTeamEmail(body, inserted.id),
    });
  } catch (err: any) {
    emailErrors.push(`team: ${err?.message ?? "unknown"}`);
  }

  try {
    // The customer's preferred language at submission time. Cookie is
    // canonical because this form runs anonymously most of the time
    // (the buyer hasn't necessarily logged in yet).
    const requestLocale = cookies().get("mik_locale")?.value || null;
    const { t: tEmail } = await getEmailTranslator(requestLocale);

    const strings: CustomerEmailStrings = {
      subject: tEmail("internationalOrderAck.subject"),
      heading: tEmail("internationalOrderAck.heading", {
        name: body.customer_name.split(" ")[0] || "there",
      }),
      intro: tEmail("internationalOrderAck.intro", { country: body.country }),
      needHelpHeading: tEmail("internationalOrderAck.needHelpHeading"),
      needHelpBody: tEmail("internationalOrderAck.needHelpBody"),
      signoff: tEmail("internationalOrderAck.signoff"),
    };

    await sendEmail({
      to: body.customer_email,
      subject: strings.subject,
      html: buildCustomerEmail(body, inserted.id, strings),
    });
  } catch (err: any) {
    emailErrors.push(`customer: ${err?.message ?? "unknown"}`);
  }

  return NextResponse.json({
    ok: true,
    request_id: inserted.id,
    email_warnings: emailErrors.length ? emailErrors : undefined,
  });
}
