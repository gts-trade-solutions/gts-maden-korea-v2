import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getVisitorIdentity } from "@/lib/analytics/identity";
import {
  fromRazorpayMinorUnits,
  formatMoney,
  isSupportedCurrency,
  type CurrencyCode,
} from "@/lib/currency";
import {
  getBusinessProfile,
  DEFAULT_BUSINESS_PROFILE,
} from "@/lib/businessInfo";
import { createAdminNotification } from "@/lib/admin/notifications";
import { getEmailTranslator } from "@/lib/i18n/email";
import { getAdminRecipientEmails } from "@/lib/notificationRecipients";
import { clearPromoCookie } from "@/lib/promo-cookie";

// Verify is the heaviest critical path: signature check, Razorpay API
// fetch, multiple DB writes, optional DTDC create, and two SES emails.
// Without this hint Netlify caps the function at 10s and a slow run
// shows the customer "Payment failed" even though the order was already
// marked paid. Give it room.
export const runtime = "nodejs";
export const maxDuration = 60;

const ses = new SESClient({
  region: process.env.SES_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.SES_ACCESS_KEY_ID!,
    secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
  },
});

const FROM_EMAIL = "info@madenkorea.com";

const money = (n: any) => +Number(n || 0).toFixed(2);

// Minimal HTML escaper for user-supplied strings interpolated into the
// confirmation email body (name fields, address lines, product names).
// Email clients aren't an XSS vector the way browsers are, but we don't
// want a stray `<` from a customer address mangling the table layout.
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveSiteUrl(req: NextRequest) {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    req.nextUrl.origin;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  const dbg: any[] = [];
  try {
    // Basic SES env debug
    console.log("RZP verify: SES env", {
      region: process.env.SES_REGION,
      hasAccessKey: !!process.env.SES_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.SES_SECRET_ACCESS_KEY,
    });

    const url = new URL(req.url);
    const DEBUG = url.searchParams.get("debug") === "1";
    const ALLOW_DEBUG = process.env.NODE_ENV !== "production";
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      app_order_id,
      raw,
      __debug,
    } = body || {};
    const WANT_DEBUG = ALLOW_DEBUG && (DEBUG || !!__debug);

    dbg.push({
      step: "init",
      env: {
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasRZPKeyId: !!process.env.RAZORPAY_KEY_ID,
        hasRZPKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
      },
    });

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !app_order_id
    ) {
      const res = {
        ok: false,
        error: "Missing fields",
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 400 });
    }

    // 1) Verify signature
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const sigOk = expected === razorpay_signature;
    dbg.push({
      step: "sig",
      expected,
      provided: razorpay_signature,
      ok: sigOk,
    });
    if (!sigOk) {
      const res = {
        ok: false,
        error: "Invalid signature",
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 400 });
    }

    // Admin (service role) client
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2) Load order (+ fields we use)
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select(
        `
        id,
        user_id,
        status,
        subtotal,
        shipping_fee,
        discount_total,
        total,
        subtotal_inr,
        shipping_fee_inr,
        discount_total_inr,
        total_inr,
        currency,
        fx_rate_snapshot,
        recipient_locale,
        order_number,
        address_snapshot,
        promo_code_id,
        promo_snapshot
      `
      )
      .eq("id", app_order_id)
      .maybeSingle();

    dbg.push({ step: "order.load", error: oErr?.message, order });
    if (oErr || !order) {
      const res = {
        ok: false,
        error: "Order not found",
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 404 });
    }
    if (order.status === "paid") {
      const res = {
        ok: true,
        order_id: order.id,
        order_number: order.order_number ?? order.id,
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res);
    }
    if (!["pending_payment", "created"].includes(order.status)) {
      const res = {
        ok: false,
        error: `Order status ${order.status}`,
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 400 });
    }

    // Order currency in a type-narrowed form. Used in every downstream
    // write that records `currency` and in the email formatter. Falls
    // back to INR for legacy rows that pre-date international support.
    const orderCurrencyRaw = order.currency || "INR";
    const orderCurrency: CurrencyCode = isSupportedCurrency(orderCurrencyRaw)
      ? orderCurrencyRaw
      : "INR";

    // 3) Existing attribution?
    const { data: attrib, error: aErr } = await admin
      .from("order_attributions")
      .select(
        "order_id, influencer_id, promo_code_id, attributed_by, discount_percent, commission_percent, commission_amount, currency, status"
      )
      .eq("order_id", order.id)
      .maybeSingle();
    dbg.push({ step: "attrib.load", error: aErr?.message, attrib });

    let discountPct = attrib?.discount_percent
      ? Number(attrib.discount_percent)
      : 0;
    let commissionPct = attrib?.commission_percent
      ? Number(attrib.commission_percent)
      : 0;
    let influencerId = attrib?.influencer_id || null;
    let promoCodeId = attrib?.promo_code_id || null;
    let attributedBy = attrib?.attributed_by || null;

    console.log("RZP verify: influencerId", influencerId);

    const tryLoadPromoById = async (id?: string | null) => {
      if (!id) return null;
      const { data: promo, error } = await admin
        .from("promo_codes")
        .select("id, influencer_id, discount_percent, commission_percent")
        .eq("id", id)
        .maybeSingle();
      dbg.push({ step: "promo.lookup", id, error: error?.message, promo });
      return promo || null;
    };

    // 4) Prefer orders.promo_code_id / promo_snapshot, then fallback to RZP notes
    if (
      (!attrib || !influencerId) &&
      (order.promo_code_id || order.promo_snapshot)
    ) {
      let promo: any = null;
      if (order.promo_code_id)
        promo = await tryLoadPromoById(order.promo_code_id);
      if (!promo && order.promo_snapshot) {
        const snap = order.promo_snapshot as any;
        const idGuess = snap?.id ?? snap?.promo_code_id ?? null;
        if (idGuess) promo = await tryLoadPromoById(idGuess);
      }
      if (promo) {
        influencerId = promo.influencer_id;
        promoCodeId = promo.id;
        discountPct = Number(promo.discount_percent || 0);
        commissionPct = Number(promo.commission_percent || 0);
        attributedBy = "promo";
      }
      dbg.push({
        step: "attrib.from.order",
        influencerId,
        promoCodeId,
        discountPct,
        commissionPct,
        attributedBy,
      });
    }

    // Fetch RZP order (to get notes + amount_paid)
    let ro: any = null;
    {
      const key_id = process.env.RAZORPAY_KEY_ID!;
      const key_secret = process.env.RAZORPAY_KEY_SECRET!;
      const auth = Buffer.from(`${key_id}:${key_secret}`).toString("base64");
      try {
        const r = await fetch(
          `https://api.razorpay.com/v1/orders/${razorpay_order_id}`,
          {
            headers: { Authorization: `Basic ${auth}` },
          }
        );
        ro = await r.json();
        dbg.push({
          step: "rzp.order",
          id: razorpay_order_id,
          amount: ro?.amount,
          amount_paid: ro?.amount_paid,
          notes: ro?.notes,
        });
      } catch (e: any) {
        dbg.push({ step: "rzp.order.error", error: e?.message || String(e) });
      }
    }

    if ((!attrib || !influencerId) && ro?.notes) {
      const notes = ro.notes;
      const promoId = notes?.promo_code_id || notes?.promoId || null;
      if (notes?.type === "promo" && promoId && notes?.influencer_id) {
        const promo = await tryLoadPromoById(promoId);
        if (promo) {
          influencerId = promo.influencer_id;
          promoCodeId = promo.id;
          discountPct = Number(promo.discount_percent || 0);
          commissionPct = Number(promo.commission_percent || 0);
          attributedBy = "promo";
        }
      }
      dbg.push({
        step: "attrib.from.notes",
        influencerId,
        promoCodeId,
        discountPct,
        commissionPct,
        attributedBy,
      });
    }

    // 5) Subtotals in two currencies.
    //
    // `base` is the order's buyer-currency subtotal (INR for Indian
    // orders, USD/EUR/etc after Phase 2 international cutover) — used
    // by emails + customer-facing math downstream.
    //
    // `baseInr` is the INR-canonical subtotal — used ONLY for the
    // K-Partnership commission calc. Influencer payouts come out of
    // the India settlement account in INR, so the commission ledger
    // is INR regardless of what the buyer paid in. Falls back to
    // `order.subtotal` for legacy pre-Phase-2 rows where
    // `subtotal_inr` is null AND the order currency was already INR
    // — same value either way.
    const base = money(order.subtotal);
    const baseInr = money(
      Number(
        (order as any).subtotal_inr ??
          (orderCurrency === "INR" ? order.subtotal : 0)
      ) || 0
    );
    const commissionAmount = money(baseInr * (commissionPct / 100));
    dbg.push({
      step: "commission",
      baseInr,
      orderCurrency,
      commissionPct,
      commissionAmount,
    });

    // 5a) Auto-approval rule. `store_settings.commission_auto_approve_days`
    // controls when a commission row becomes withdrawable:
    //   0 → approve immediately on payment verification.
    //   N → leave 'pending'; the daily cron at
    //       /api/cron/commission-approve flips pending → approved
    //       once `now > paid_at + N days`.
    // Phase 1 ships with default 0 so commissions are spendable
    // straight away — admin opts into a delay later if they want
    // a return-window buffer.
    let autoApproveDays = 0;
    try {
      const { data: settings } = await admin
        .from("store_settings")
        .select("commission_auto_approve_days")
        .eq("id", 1)
        .maybeSingle();
      const raw = Number((settings as any)?.commission_auto_approve_days);
      autoApproveDays =
        Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
    } catch (e: any) {
      dbg.push({ step: "settings.auto_approve.error", error: e?.message });
    }
    const initialAttribStatus: "pending" | "approved" =
      autoApproveDays === 0 ? "approved" : "pending";

    // 5b) Write attribution robustly (insert then update).
    // Currency always 'INR' so dashboard sums + payout availability
    // math never mix currencies regardless of the buyer's currency.
    if (influencerId) {
      const ins = await admin.from("order_attributions").insert({
        order_id: order.id,
        influencer_id: influencerId,
        promo_code_id: promoCodeId ?? null,
        attributed_by: attributedBy ?? (promoCodeId ? "promo" : "link"),
        discount_percent: discountPct,
        commission_percent: commissionPct,
        commission_amount: commissionAmount,
        currency: "INR",
        status: initialAttribStatus,
      });
      dbg.push({ step: "attrib.insert", error: ins.error?.message });

      if (ins.error) {
        const upd = await admin
          .from("order_attributions")
          .update({
            influencer_id: influencerId,
            promo_code_id: promoCodeId ?? null,
            attributed_by: attributedBy ?? (promoCodeId ? "promo" : "link"),
            discount_percent: discountPct,
            commission_percent: commissionPct,
            commission_amount: commissionAmount,
            currency: "INR",
            status: initialAttribStatus,
          })
          .eq("order_id", order.id);
        dbg.push({ step: "attrib.update", error: upd.error?.message });
      }
    } else {
      dbg.push({ step: "attrib.skip", reason: "no influencerId resolved" });
    }

    // 6) Mark order paid + write actual paid
    const shippingFee = money(order.shipping_fee);
    const discountAmount = money(base * (discountPct / 100));
    const computedFinal = money(base - discountAmount + shippingFee);

    // Razorpay returns `amount_paid` in the smallest unit of the
    // order's currency. For INR/USD/EUR/etc that's × 100; for VND
    // (zero-decimal) it's × 1. The exponent helper picks the right
    // divisor so non-INR orders read back the correct major-unit total.
    const paidAmount =
      ro && typeof ro.amount_paid === "number"
        ? money(fromRazorpayMinorUnits(ro.amount_paid, orderCurrency))
        : computedFinal;

    const updOrder = await admin
      .from("orders")
      .update({
        status: "paid",
        discount_total: discountAmount,
        total: paidAmount,
        payment_provider: "razorpay",
        payment_reference: razorpay_payment_id,
        payment_meta: raw ? { raw } : null,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    // Admin bell notification — best-effort, never fails the payment.
    void createAdminNotification({
      type: "order_placed",
      title: `New order ${order.order_number ?? order.id} — ${formatMoney(paidAmount, orderCurrency)}`,
      body: order.user_id ? null : "Guest checkout",
      link: `/admin/orders/${order.id}`,
      severity: "info",
      meta: { order_id: order.id, currency: orderCurrency, total: paidAmount },
      createdBy: order.user_id ?? null,
    });

    // M-07: persist a row in `payments` for every successful capture so
    // refund / reporting flows have a real record to read. Best-effort —
    // if it fails we log but don't fail the payment.
    try {
      const payIns = await admin.from("payments").insert({
        order_id: order.id,
        provider: "razorpay",
        provider_payment_id: razorpay_payment_id,
        provider_order_id: razorpay_order_id,
        method: raw?.method ?? null,
        status: "captured",
        amount: paidAmount,
        currency: orderCurrency,
        signature: razorpay_signature,
        raw: raw ?? null,
      });
      dbg.push({ step: "payments.insert", error: payIns.error?.message });
    } catch (err: any) {
      dbg.push({ step: "payments.insert", error: err?.message });
    }

    // Server-side `order_placed` event — the denominator-correct truth.
    // Client-emitted `payment_succeeded` can be lost to a closed tab during
    // verify, so we double-write here from the server.
    //
    // Use the BROWSER's session/anon cookies (not the Razorpay order id) so
    // this row sits in the same funnel session as the preceding page_view,
    // add_to_cart, pay_clicked, etc. Otherwise it lands in a phantom one-row
    // session and inflates the Purchased stage.
    try {
      let consentOk = true;
      if (order.user_id) {
        const { data: prof } = await admin
          .from("profiles")
          .select("tracking_consent")
          .eq("id", order.user_id)
          .maybeSingle();
        if (prof && prof.tracking_consent === false) consentOk = false;
      }

      if (consentOk) {
        let anonId: string | null = null;
        let sessionId: string | null = null;
        try {
          const ident = getVisitorIdentity();
          anonId = ident.anonId ?? null;
          sessionId = ident.sessionId ?? null;
        } catch (e: any) {
          dbg.push({ step: "events.identity.error", error: e?.message });
        }

        await admin.from("events").insert({
          user_id: order.user_id ?? null,
          anon_id: anonId,
          session_id: sessionId,
          event_name: "order_placed",
          path: "/api/razorpay/verify",
          props: {
            order_id: order.id,
            order_number: order.order_number ?? null,
            subtotal: order.subtotal,
            shipping_fee: order.shipping_fee,
            discount_total: discountAmount,
            total: paidAmount,
            provider_payment_id: razorpay_payment_id,
            provider_order_id: razorpay_order_id,
          },
        });
      } else {
        dbg.push({ step: "events.order_placed.skip", reason: "no consent" });
      }
    } catch (err: any) {
      dbg.push({ step: "events.order_placed", error: err?.message });
    }

    // C-13/C-14 prep — Track D: auto-create DTDC shipment on payment
    // verify. Gated by env flag so it stays off until the merchant is
    // comfortable. Failure here must not roll back the payment.
    // DTDC is India-only, so we additionally skip for any non-INR
    // (international) order — the courier would reject it anyway and
    // the failed call just adds noise to logs.
    if (
      process.env.DTDC_AUTO_CREATE_ON_PAYMENT === "true" &&
      orderCurrency === "INR"
    ) {
      try {
        // Idempotency: skip if an active shipment already exists for
        // this order (e.g. admin already created it manually).
        const existing = await admin
          .from("dtdc_shipments")
          .select("id")
          .eq("order_id", order.id)
          .eq("is_active", true)
          .maybeSingle();
        if (!existing.data) {
          const { createDtdcShipmentForOrder } = await import(
            "@/lib/dtdc/createShipmentForOrder"
          );
          await createDtdcShipmentForOrder(admin as any, order.id, {
            mode: "auto",
            force_new: false,
          });
          dbg.push({ step: "dtdc.auto_create", ok: true });
        } else {
          dbg.push({ step: "dtdc.auto_create", ok: true, skipped: "existing" });
        }
      } catch (err: any) {
        dbg.push({ step: "dtdc.auto_create", ok: false, error: err?.message });
      }
    }

    dbg.push({
      step: "order.update",
      error: updOrder.error?.message,
      write: { discountAmount, paidAmount, shippingFee },
    });
    if (updOrder.error) {
      const res = {
        ok: false,
        error: updOrder.error.message,
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 500 });
    }

    // 6a) Dual-write: re-mirror the now-paid order into MySQL so the account
    // pages (which read orders from MySQL) reflect status=paid + payment meta
    // + final totals. Supabase stays authoritative; this is best-effort and
    // must never fail the payment.
    try {
      const { mirrorOrderIntoMysql } = await import("@/lib/data/orders");
      await mirrorOrderIntoMysql(admin, order.id);
      dbg.push({ step: "mysql.order.mirror", ok: true });
    } catch (e: any) {
      console.error("[dual-write] verify order MySQL mirror failed:", e);
      dbg.push({ step: "mysql.order.mirror", ok: false, error: e?.message });
    }

    // 6b) Mirror the influencer attribution (commission ledger) into MySQL, so
    // migrated influencer dashboards read correct earnings. After the order
    // mirror above so the FK target exists. Best-effort.
    if (influencerId) {
      try {
        const { mirrorOrderAttributionIntoMysql } = await import("@/lib/data/attribution");
        await mirrorOrderAttributionIntoMysql(admin, order.id);
        dbg.push({ step: "mysql.attribution.mirror", ok: true });
      } catch (e: any) {
        console.error("[dual-write] verify attribution MySQL mirror failed:", e);
        dbg.push({ step: "mysql.attribution.mirror", ok: false, error: e?.message });
      }
    }

    // 7) Promo uses (best-effort)
    if (promoCodeId) {
      const uses = await admin.rpc("increment_promo_use", {
        p_promo_id: promoCodeId,
      });
      dbg.push({
        step: "promo.uses",
        error: uses.error?.message,
        incremented: uses.data ?? null,
      });

      // Mirror the bumped uses (+ active flip on max_uses) into MySQL.
      try {
        const { mirrorPromoUsesIntoMysql } = await import("@/lib/data/attribution");
        await mirrorPromoUsesIntoMysql(admin, promoCodeId);
        dbg.push({ step: "mysql.promo.uses.mirror", ok: true });
      } catch (e: any) {
        console.error("[dual-write] verify promo-uses MySQL mirror failed:", e);
        dbg.push({ step: "mysql.promo.uses.mirror", ok: false, error: e?.message });
      }
    }

    // 8) Clear cart
    if (order.user_id) {
      const cleared = await admin.rpc("cart_clear_for_user", {
        p_user_id: order.user_id,
      });
      dbg.push({ step: "cart.clear", error: cleared.error?.message });

      // Mirror the clear into MySQL so the storefront cart (badge + cart
      // page, which read MySQL) empties too. Best-effort.
      try {
        const { clearCartMysql } = await import("@/lib/data/cart");
        await clearCartMysql(order.user_id);
        dbg.push({ step: "mysql.cart.clear", ok: true });
      } catch (e: any) {
        console.error("[dual-write] verify cart clear MySQL mirror failed:", e);
        dbg.push({ step: "mysql.cart.clear", ok: false, error: e?.message });
      }
    }

    // 8a) Clear the applied promo cookie. Otherwise the same code
    // auto-re-applies on the user's next cart visit, with no UI to
    // remove it without manual intervention. Best-effort — cookie
    // ops can throw in non-route-handler contexts.
    try {
      clearPromoCookie();
      dbg.push({ step: "promo.cookie.cleared" });
    } catch (err: any) {
      dbg.push({ step: "promo.cookie.clear.error", error: err?.message });
    }

    // 9) Send confirmation emails (best-effort; failures won't affect
    // order success). Both emails are kicked off in parallel via
    // Promise.allSettled below to keep the route under the function
    // timeout — sequential awaits added ~3-5s and were causing
    // "Payment failed" toasts even on successful payments.
    const emailPromises: Promise<unknown>[] = [];
    try {
      const orderNumber = order.order_number ?? order.id;
      const currency = orderCurrency;
      // Use Intl.NumberFormat-backed `formatMoney` so non-INR orders
      // render correctly ("$36.00" instead of "USD 36.00") and
      // zero-decimal currencies (VND, etc.) don't show phantom paise.
      const fmt = (v: number) => formatMoney(v, currency);
      const totalFormatted = fmt(paidAmount);
      const siteUrl = resolveSiteUrl(req);
      const accountOrdersUrl = `${siteUrl}/account/orders`;

      // Pull live business profile (brand + partner + country-resolved
      // contact details) from `store_settings` + `country_contacts` so
      // changes the admin makes in /admin/settings → Business propagate
      // to the order confirmation email immediately. The visitor's country
      // comes from the `mik_country` cookie carried on the verify POST —
      // the same browser session that placed the order. Falls back to the
      // module-level defaults if either read fails; we never want a
      // transient DB error to block the confirmation email.
      const orderCountry =
        cookies().get("mik_country")?.value?.toUpperCase() || null;
      const profile = await getBusinessProfile(orderCountry ?? undefined).catch(
        () => DEFAULT_BUSINESS_PROFILE
      );
      const supportEmail =
        profile.contact.supportEmail ||
        DEFAULT_BUSINESS_PROFILE.contact.supportEmail;

      // The admin enters the phone in whatever display form they prefer
      // (e.g. "+91 93848 57587" or "9384857587"). For the human-readable
      // line we keep that string as-is. For the `tel:` href we strip
      // everything except digits and `+` so the dial action works on
      // any device.
      const supportPhoneDisplay = profile.contact.phone || "";
      const phoneDigits = supportPhoneDisplay.replace(/[^\d+]/g, "");
      const supportPhoneHref = phoneDigits ? `tel:${phoneDigits}` : "";
      const supportContactName = profile.contact.contactName || "";

      // Brand + Partner footer text. Brand stays the same on every email;
      // partner is the local importer/distributor responsible for
      // fulfillment, GST and grievances. Only renders the block(s) that
      // have data — keeps the email tidy if either side isn't configured.
      const brandFooterHtml = profile.brand.legalEntityName
        ? `<strong>${escapeHtml(profile.brand.legalEntityName)}</strong>${
            profile.brand.registeredAddress
              ? `<br />${escapeHtml(profile.brand.registeredAddress)}`
              : ""
          }${
            profile.brand.email
              ? `<br /><a href="mailto:${escapeHtml(profile.brand.email)}" style="color: inherit; text-decoration: none">${escapeHtml(profile.brand.email)}</a>`
              : ""
          }`
        : "";
      const partnerFooterHtml = profile.partner.legalEntityName
        ? `<strong>${escapeHtml(profile.partner.roleLabel)}</strong><br /><strong>${escapeHtml(profile.partner.legalEntityName)}</strong>${
            profile.partner.registeredAddress
              ? `<br />${escapeHtml(profile.partner.registeredAddress)}`
              : ""
          }${
            profile.partner.gstin
              ? `<br />GSTIN: ${escapeHtml(profile.partner.gstin)}`
              : ""
          }`
        : "";
      const brandFooterText = profile.brand.legalEntityName
        ? [
            profile.brand.legalEntityName,
            profile.brand.registeredAddress,
            profile.brand.email,
          ]
            .filter(Boolean)
            .join("\n")
        : "";
      const partnerFooterText = profile.partner.legalEntityName
        ? [
            profile.partner.roleLabel,
            profile.partner.legalEntityName,
            profile.partner.registeredAddress,
            profile.partner.gstin ? `GSTIN: ${profile.partner.gstin}` : null,
          ]
            .filter(Boolean)
            .join("\n")
        : "";

      // Localize the buyer-facing email to the locale the order was
      // placed in. Admin notification stays English regardless (it
      // goes to internal team).
      const { t: tEmail } = await getEmailTranslator(
        (order as any).recipient_locale ?? null
      );

      // Order items for the line-item table. Unit prices live in INR
      // on the row (cart_items copies in INR), so for non-INR orders
      // we multiply by the FX rate captured on the order at create time
      // so each row reads in the buyer's currency consistently with
      // the total at the bottom.
      const fxRate = Number(order.fx_rate_snapshot) || 1;
      const { data: orderItemsRaw } = await admin
        .from("order_items")
        .select("name, sku, quantity, unit_price, line_total")
        .eq("order_id", order.id);
      type OrderItem = {
        name: string | null;
        sku: string | null;
        quantity: number;
        unit_price: number;
        line_total: number;
      };
      const orderItems: OrderItem[] = (orderItemsRaw ?? []).map((r: any) => ({
        name: r.name ?? null,
        sku: r.sku ?? null,
        quantity: Number(r.quantity) || 0,
        unit_price: money(Number(r.unit_price) * fxRate || 0),
        line_total: money(Number(r.line_total) * fxRate || 0),
      }));

      // Address snapshot from `orders.address_snapshot`. Shape is a
      // free-form jsonb populated by the checkout form, so we read
      // defensively. Legacy rows may have a different shape (older
      // checkouts didn't write `country_code`).
      const addr = (order.address_snapshot ?? {}) as Record<string, any>;
      const addrLines: string[] = [];
      if (addr.name) addrLines.push(String(addr.name));
      if (addr.address || addr.line1) {
        addrLines.push(String(addr.address ?? addr.line1));
      }
      if (addr.line2) addrLines.push(String(addr.line2));
      const cityStateZip = [addr.city, addr.state, addr.pincode]
        .filter(Boolean)
        .join(", ");
      if (cityStateZip) addrLines.push(cityStateZip);
      if (addr.country) addrLines.push(String(addr.country));
      if (addr.phone) addrLines.push(String(addr.phone));
      const addressHtml = addrLines
        .map((l) => escapeHtml(l))
        .join("<br />");
      const addressText = addrLines.join("\n");

      let userEmail: string | null = null;
      let userName: string | null = null;

      if (order.user_id) {
        // profile for full_name
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", order.user_id)
          .maybeSingle();

        // auth user for email (correct admin API)
        const { data: userData, error: userErr } =
          await admin.auth.admin.getUserById(order.user_id);

        dbg.push({ step: "user.load", error: userErr?.message });
        console.log("RZP verify: loaded user from Supabase", {
          userErr,
          hasUser: !!userData?.user,
        });

        userEmail = userData?.user?.email ?? null;
        userName =
          profile?.full_name ??
          (userData?.user?.user_metadata as any)?.full_name ??
          null;
      }

      // === User confirmation email ===
      if (userEmail) {
        const friendlyName = userName || "there";
        const subject = tEmail("orderConfirm.subject", { orderNumber });

        console.log("SES: sending user email", { to: userEmail, subject });

        const userHtml = `
          <div
            style="
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
                sans-serif;
              font-size: 14px;
              color: #111827;
              background-color: #f9fafb;
              padding: 24px;
            "
          >
            <div
              style="
                max-width: 640px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 10px;
                border: 1px solid #e5e7eb;
                padding: 24px 24px 20px;
              "
            >
              <div style="text-align: center; margin-bottom: 24px">
                <div
                  style="
                    display: inline-block;
                    padding: 8px 14px;
                    border-radius: 999px;
                    background: #f9731610;
                    color: #ea580c;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                  "
                >
                  ${tEmail("orderConfirm.pill")}
                </div>
                <h2
                  style="
                    font-size: 20px;
                    font-weight: 600;
                    margin-top: 12px;
                    margin-bottom: 4px;
                  "
                >
                  ${tEmail("orderConfirm.heading", { name: friendlyName })}
                </h2>
                <p style="margin: 0; color: #4b5563; font-size: 13px">
                  ${tEmail("orderConfirm.intro")}
                </p>
              </div>

              ${
                orderItems.length > 0
                  ? `
              <div style="margin-bottom: 20px">
                <h3 style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #111827">
                  ${tEmail("orderConfirm.itemsHeading")}
                </h3>
                <table style="width: 100%; max-width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; table-layout: fixed">
                  <colgroup>
                    <col style="width: 50%" />
                    <col style="width: 12%" />
                    <col style="width: 19%" />
                    <col style="width: 19%" />
                  </colgroup>
                  <thead style="background: #f9fafb">
                    <tr>
                      <th style="text-align: left; padding: 8px 10px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb">${tEmail("orderConfirm.colItem")}</th>
                      <th style="text-align: right; padding: 8px 10px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb">${tEmail("orderConfirm.colQty")}</th>
                      <th style="text-align: right; padding: 8px 10px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb">${tEmail("orderConfirm.colUnitPrice")}</th>
                      <th style="text-align: right; padding: 8px 10px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb">${tEmail("orderConfirm.colLineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orderItems
                      .map(
                        (it) => `
                    <tr>
                      <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; word-break: break-word; overflow-wrap: anywhere">
                        <div style="font-weight: 500; color: #111827; word-break: break-word; overflow-wrap: anywhere">${escapeHtml(it.name ?? "—")}</div>
                        ${it.sku ? `<div style="font-size: 11px; color: #9ca3af; font-family: monospace; word-break: break-all; overflow-wrap: anywhere">${escapeHtml(it.sku)}</div>` : ""}
                      </td>
                      <td style="padding: 8px 10px; text-align: right; border-bottom: 1px solid #f3f4f6; word-break: break-word">${it.quantity}</td>
                      <td style="padding: 8px 10px; text-align: right; border-bottom: 1px solid #f3f4f6; word-break: break-word">${fmt(it.unit_price)}</td>
                      <td style="padding: 8px 10px; text-align: right; border-bottom: 1px solid #f3f4f6; font-weight: 500; word-break: break-word">${fmt(it.line_total)}</td>
                    </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
                `
                  : ""
              }

              ${
                addrLines.length > 0
                  ? `
              <div style="margin-bottom: 20px; padding: 14px 16px; border-radius: 10px; background: #f9fafb; border: 1px solid #e5e7eb">
                <h3 style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #111827">
                  ${tEmail("orderConfirm.shippingAddressHeading")}
                </h3>
                <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.5">
                  ${addressHtml}
                </p>
              </div>
                `
                  : ""
              }

              <div
                style="
                  background: #f9fafb;
                  border-radius: 10px;
                  padding: 16px 18px;
                  margin-bottom: 20px;
                "
              >
                <h3
                  style="
                    margin: 0 0 8px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #111827;
                  "
                >
                  ${tEmail("orderConfirm.summaryHeading")}
                </h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px">
                  <tbody>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">${tEmail("orderConfirm.rowOrderNumber")}</td>
                      <td style="padding: 4px 0; text-align: right; font-weight: 500">
                        ${orderNumber}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">${tEmail("orderConfirm.rowSubtotal")}</td>
                      <td style="padding: 4px 0; text-align: right;">
                        ${fmt(base)}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">${tEmail("orderConfirm.rowDiscount")}</td>
                      <td style="padding: 4px 0; text-align: right;">
                        - ${fmt(discountAmount)} (${discountPct.toFixed(2)}%)
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">${tEmail("orderConfirm.rowShipping")}</td>
                      <td style="padding: 4px 0; text-align: right;">
                        ${fmt(shippingFee)}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">${tEmail("orderConfirm.rowTotal")}</td>
                      <td
                        style="
                          padding: 4px 0;
                          text-align: right;
                          font-weight: 600;
                          color: #111827;
                        "
                      >
                        ${totalFormatted}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #6b7280">${tEmail("orderConfirm.rowPaymentMethod")}</td>
                      <td style="padding: 4px 0; text-align: right">Razorpay</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style="margin-bottom: 20px">
                <h3
                  style="
                    margin: 0 0 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #111827;
                  "
                >
                  ${tEmail("orderConfirm.trackHeading")}
                </h3>
                <p style="margin: 0 0 10px; color: #4b5563; font-size: 13px">
                  ${tEmail("orderConfirm.trackBody")}
                </p>
                <a
                  href="${accountOrdersUrl}"
                  style="
                    display: inline-block;
                    padding: 8px 14px;
                    border-radius: 999px;
                    background: #111827;
                    color: #f9fafb;
                    font-size: 12px;
                    font-weight: 500;
                    text-decoration: none;
                  "
                >
                  ${tEmail("orderConfirm.trackCta")}
                </a>
              </div>

              <div
                style="
                  margin-bottom: 20px;
                  padding: 14px 16px;
                  border-radius: 10px;
                  background: #fef3c7;
                  border: 1px solid #facc15;
                "
              >
                <h3
                  style="
                    margin: 0 0 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #92400e;
                  "
                >
                  ${tEmail("orderConfirm.needHelpHeading")}
                </h3>
                <p style="margin: 0 0 4px; color: #92400e; font-size: 13px">
                  ${tEmail("orderConfirm.needHelpBody")}
                </p>
                <p style="margin: 0; color: #92400e; font-size: 13px">
                  ${supportContactName
                    ? `<strong>${tEmail("orderConfirm.needHelpContact")}</strong> ${escapeHtml(supportContactName)}<br />`
                    : ""}
                  ${supportPhoneDisplay
                    ? `<strong>${tEmail("orderConfirm.needHelpPhone")}</strong> <a href="${supportPhoneHref}" style="color: inherit; text-decoration: none">${supportPhoneDisplay}</a><br />`
                    : ""}
                  <strong>${tEmail("orderConfirm.needHelpEmail")}</strong>
                  <a
                    href="mailto:${supportEmail}"
                    style="color: inherit; text-decoration: none"
                    >${supportEmail}</a
                  >
                </p>
              </div>

              <div style="margin-bottom: 16px">
                <h3
                  style="
                    margin: 0 0 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #111827;
                  "
                >
                  ${tEmail("orderConfirm.productsNoteHeading")}
                </h3>
                <p style="margin: 0 0 6px; color: #4b5563; font-size: 13px">
                  ${tEmail("orderConfirm.productsNoteIntro")}
                </p>
                <ul style="margin: 0 0 6px 18px; padding: 0; color: #4b5563; font-size: 13px">
                  <li>${tEmail("orderConfirm.productsNoteTip1")}</li>
                  <li>${tEmail("orderConfirm.productsNoteTip2")}</li>
                  <li>${tEmail("orderConfirm.productsNoteTip3")}</li>
                </ul>
                <p style="margin: 0; color: #4b5563; font-size: 13px">
                  ${tEmail("orderConfirm.productsNoteOutro")}
                </p>
              </div>

              <p
                style="
                  margin-top: 20px;
                  margin-bottom: 4px;
                  color: #4b5563;
                  font-size: 13px;
                "
              >
                ${tEmail("orderConfirm.closing")}
              </p>
              <p style="margin: 0; color: #4b5563; font-size: 13px">
                ${tEmail("orderConfirm.signoff")}<br />
                <strong>${tEmail("orderConfirm.signoffName")}</strong>
              </p>
            </div>

            ${
              brandFooterHtml || partnerFooterHtml
                ? `
            <div
              style="
                margin: 20px auto 0;
                max-width: 640px;
                padding: 16px;
                border-top: 1px solid #e5e7eb;
                color: #6b7280;
                font-size: 12px;
                line-height: 1.6;
              "
            >
              ${
                brandFooterHtml
                  ? `<div style="margin-bottom: 12px"><span style="color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;">${tEmail("orderConfirm.brandFooterLabel")}</span><br />${brandFooterHtml}</div>`
                  : ""
              }
              ${
                partnerFooterHtml
                  ? `<div>${partnerFooterHtml}</div>`
                  : ""
              }
            </div>
            `
                : ""
            }

            <p
              style="
                margin: 16px auto 0;
                max-width: 640px;
                text-align: center;
                color: #9ca3af;
                font-size: 11px;
              "
            >
              ${tEmail("orderConfirm.footer")}
            </p>
          </div>
        `;

        const userText = [
          tEmail("orderConfirm.heading", { name: friendlyName }),
          "",
          tEmail("orderConfirm.intro"),
          "",
          // Line items
          ...(orderItems.length > 0
            ? [
                tEmail("orderConfirm.itemsHeading") + ":",
                ...orderItems.map(
                  (it) =>
                    `  - ${it.name ?? "—"}${it.sku ? ` (${it.sku})` : ""} × ${it.quantity}  @  ${fmt(it.unit_price)}  =  ${fmt(it.line_total)}`
                ),
                "",
              ]
            : []),
          // Shipping address
          ...(addrLines.length > 0
            ? [
                tEmail("orderConfirm.shippingAddressHeading") + ":",
                ...addrLines.map((l) => `  ${l}`),
                "",
              ]
            : []),
          `${tEmail("orderConfirm.rowOrderNumber")}: ${orderNumber}`,
          `${tEmail("orderConfirm.rowSubtotal")}: ${fmt(base)}`,
          `${tEmail("orderConfirm.rowDiscount")}: ${fmt(discountAmount)} (${discountPct.toFixed(2)}%)`,
          `${tEmail("orderConfirm.rowShipping")}: ${fmt(shippingFee)}`,
          `${tEmail("orderConfirm.rowTotal")}: ${totalFormatted}`,
          `${tEmail("orderConfirm.rowPaymentMethod")}: Razorpay`,
          "",
          tEmail("orderConfirm.trackBody"),
          accountOrdersUrl,
          "",
          tEmail("orderConfirm.needHelpBody"),
          ...(supportContactName
            ? [`${tEmail("orderConfirm.needHelpContact")} ${supportContactName}`]
            : []),
          ...(supportPhoneDisplay
            ? [`${tEmail("orderConfirm.needHelpPhone")} ${supportPhoneDisplay}`]
            : []),
          `${tEmail("orderConfirm.needHelpEmail")} ${supportEmail}`,
          "",
          tEmail("orderConfirm.signoff"),
          tEmail("orderConfirm.signoffName"),
          ...(brandFooterText
            ? [
                "",
                "—".repeat(20),
                tEmail("orderConfirm.brandFooterLabel"),
                brandFooterText,
              ]
            : []),
          ...(partnerFooterText ? ["", partnerFooterText] : []),
        ].join("\n");

        emailPromises.push(
          ses
            .send(
              new SendEmailCommand({
                Source: FROM_EMAIL,
                Destination: { ToAddresses: [userEmail] },
                Message: {
                  Subject: { Data: subject },
                  Body: {
                    Html: { Data: userHtml },
                    Text: { Data: userText },
                  },
                },
              })
            )
            .then(
              () => {
                console.log("SES: user email sent OK", { to: userEmail });
                dbg.push({ step: "email.user.ok", to: userEmail });
              },
              (e) => {
                console.error("SES: user email failed", e);
                dbg.push({
                  step: "email.user.error",
                  error: e?.message || String(e),
                });
              }
            )
        );
      } else {
        console.log("SES: skipping user email – no userEmail resolved", {
          userId: order.user_id,
        });
        dbg.push({ step: "email.user.skip", reason: "no user email" });
      }

      // === Admin notification email ===
      const adminSubject = `New order placed: ${orderNumber}`;
      const hasPromo = !!promoCodeId;
      const hasInfluencer = !!influencerId;

      const adminHtml = `
        <div
          style="
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
              sans-serif;
            font-size: 14px;
            color: #111827;
            background-color: #f9fafb;
            padding: 24px;
          "
        >
          <div
            style="
              max-width: 640px;
              margin: 0 auto;
              background: #ffffff;
              border-radius: 10px;
              border: 1px solid #e5e7eb;
              padding: 24px 24px 20px;
            "
          >
            <h2
              style="
                font-size: 18px;
                font-weight: 600;
                margin: 0 0 12px;
              "
            >
              New order placed
            </h2>

            <div
              style="
                background: #f9fafb;
                border-radius: 10px;
                padding: 14px 16px;
                margin-bottom: 16px;
              "
            >
              <h3
                style="
                  margin: 0 0 8px;
                  font-size: 13px;
                  font-weight: 600;
                  color: #111827;
                "
              >
                Order details
              </h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px">
                <tbody>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Order number</td>
                    <td style="padding: 4px 0; text-align: right; font-weight: 500">
                      ${orderNumber}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Subtotal</td>
                    <td style="padding: 4px 0; text-align: right;">
                      ${fmt(base)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Discount</td>
                    <td style="padding: 4px 0; text-align: right;">
                      - ${fmt(discountAmount)} (${discountPct.toFixed(2)}%)
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Shipping</td>
                    <td style="padding: 4px 0; text-align: right;">
                      ${fmt(shippingFee)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Total paid</td>
                    <td
                      style="
                        padding: 4px 0;
                        text-align: right;
                        font-weight: 600;
                        color: #111827;
                      "
                    >
                      ${fmt(paidAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #6b7280">Payment provider</td>
                    <td style="padding: 4px 0; text-align: right;">Razorpay</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              style="
                background: #eef2ff;
                border-radius: 10px;
                padding: 14px 16px;
                margin-bottom: 16px;
              "
            >
              <h3
                style="
                  margin: 0 0 8px;
                  font-size: 13px;
                  font-weight: 600;
                  color: #1d4ed8;
                "
              >
                Customer details
              </h3>
              <p style="margin: 0 0 4px; color: #1f2937; font-size: 13px">
                <strong>User ID:</strong> ${order.user_id || "guest"}
              </p>
              <p style="margin: 0 0 4px; color: #1f2937; font-size: 13px">
                <strong>User email:</strong> ${userEmail || "—"}
              </p>
            </div>

            <div
              style="
                background: #ecfdf5;
                border-radius: 10px;
                padding: 14px 16px;
                margin-bottom: 16px;
              "
            >
              <h3
                style="
                  margin: 0 0 8px;
                  font-size: 13px;
                  font-weight: 600;
                  color: #047857;
                "
              >
                Promotion & attribution
              </h3>
              <p style="margin: 0 0 4px; color: #064e3b; font-size: 13px">
                <strong>Promo code ID:</strong> ${promoCodeId || "—"}
              </p>
              <p style="margin: 0 0 4px; color: #064e3b; font-size: 13px">
                <strong>Influencer ID:</strong> ${influencerId || "—"}
              </p>
              <p style="margin: 0 0 4px; color: #064e3b; font-size: 13px">
                <strong>Discount % (attribution):</strong> ${discountPct.toFixed(
        2
      )}%
              </p>
              <p style="margin: 0 0 4px; color: #064e3b; font-size: 13px">
                <strong>Commission %:</strong> ${commissionPct.toFixed(2)}%
              </p>
              <p style="margin: 0; color: #064e3b; font-size: 13px">
                <strong>Commission amount:</strong> ${fmt(commissionAmount)}
              </p>
            </div>

            ${
              orderItems.length > 0
                ? `
            <div style="margin-bottom: 16px">
              <h3 style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #111827">
                Items
              </h3>
              <table style="width: 100%; max-width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; table-layout: fixed">
                <colgroup>
                  <col style="width: 50%" />
                  <col style="width: 12%" />
                  <col style="width: 19%" />
                  <col style="width: 19%" />
                </colgroup>
                <thead style="background: #f9fafb">
                  <tr>
                    <th style="text-align: left; padding: 8px 10px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb">Item</th>
                    <th style="text-align: right; padding: 8px 10px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb">Qty</th>
                    <th style="text-align: right; padding: 8px 10px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb">Unit</th>
                    <th style="text-align: right; padding: 8px 10px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  ${orderItems
                    .map(
                      (it) => `
                  <tr>
                    <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; word-break: break-word; overflow-wrap: anywhere">
                      <div style="font-weight: 500; color: #111827; word-break: break-word; overflow-wrap: anywhere">${escapeHtml(it.name ?? "—")}</div>
                      ${it.sku ? `<div style="font-size: 11px; color: #9ca3af; font-family: monospace; word-break: break-all; overflow-wrap: anywhere">${escapeHtml(it.sku)}</div>` : ""}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; border-bottom: 1px solid #f3f4f6; word-break: break-word">${it.quantity}</td>
                    <td style="padding: 8px 10px; text-align: right; border-bottom: 1px solid #f3f4f6; word-break: break-word">${fmt(it.unit_price)}</td>
                    <td style="padding: 8px 10px; text-align: right; border-bottom: 1px solid #f3f4f6; font-weight: 500; word-break: break-word">${fmt(it.line_total)}</td>
                  </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
              `
                : ""
            }

            ${
              addrLines.length > 0
                ? `
            <div style="margin-bottom: 16px; padding: 12px 14px; border-radius: 8px; background: #f9fafb; border: 1px solid #e5e7eb">
              <h3 style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #111827">
                Shipping address
              </h3>
              <p style="margin: 0; color: #4b5563; font-size: 13px; line-height: 1.5">
                ${addressHtml}
              </p>
            </div>
              `
                : ""
            }
          </div>
        </div>
      `;

      const adminText = [
        "New order placed:",
        `Order number: ${orderNumber}`,
        `Subtotal: ${fmt(base)}`,
        `Discount: ${fmt(discountAmount)} (${discountPct.toFixed(2)}%)`,
        `Shipping: ${fmt(shippingFee)}`,
        `Total paid: ${fmt(paidAmount)}`,
        `User ID: ${order.user_id || "guest"}`,
        `User email: ${userEmail || "—"}`,
        `Payment provider: Razorpay`,
        `Promo code ID: ${promoCodeId || "—"}`,
        `Influencer ID: ${influencerId || "—"}`,
        `Commission %: ${commissionPct.toFixed(2)}%`,
        `Commission amount: ${fmt(commissionAmount)}`,
        // Line items
        ...(orderItems.length > 0
          ? [
              "",
              "Items:",
              ...orderItems.map(
                (it) =>
                  `  - ${it.name ?? "—"}${it.sku ? ` (${it.sku})` : ""} × ${it.quantity}  @  ${fmt(it.unit_price)}  =  ${fmt(it.line_total)}`
              ),
            ]
          : []),
        // Shipping address
        ...(addrLines.length > 0
          ? ["", "Shipping address:", ...addrLines.map((l) => `  ${l}`)]
          : []),
      ].join("\n");

      // Resolve admin recipients dynamically from
      // `notification_recipients`. Admin manages the list at
      // /admin/settings/notification-emails. If the list is empty we
      // skip the admin notification (customer email still fires).
      const adminRecipients = await getAdminRecipientEmails();

      if (adminRecipients.length === 0) {
        dbg.push({ step: "email.admin.skip", reason: "no active recipients" });
      } else {
        console.log("SES: sending admin email", {
          to: adminRecipients,
          subject: adminSubject,
        });

        emailPromises.push(
          ses
            .send(
              new SendEmailCommand({
                Source: FROM_EMAIL,
                Destination: {
                  ToAddresses: adminRecipients,
                  CcAddresses: [FROM_EMAIL],
                },
                Message: {
                  Subject: { Data: adminSubject },
                  Body: {
                    Html: { Data: adminHtml },
                    Text: { Data: adminText },
                  },
                },
              })
            )
            .then(
              () => {
                console.log("SES: admin email sent OK", {
                  to: adminRecipients,
                });
                dbg.push({ step: "email.admin.ok", to: adminRecipients });
              },
              (e) => {
                console.error("SES: admin email failed", e);
                dbg.push({
                  step: "email.admin.error",
                  error: e?.message || String(e),
                });
              }
            )
        );
      }
    } catch (e: any) {
      console.error("SES: email setup failed", e);
      dbg.push({ step: "email.error", error: e?.message || String(e) });
    }

    // Wait for both SES sends in parallel — total cost is the slower of
    // the two, not the sum.
    if (emailPromises.length) {
      await Promise.allSettled(emailPromises);
    }

    const res = {
      ok: true,
      order_id: order.id,
      order_number: order.order_number ?? order.id,
      debug: WANT_DEBUG ? dbg : undefined,
    };
    return NextResponse.json(res);
  } catch (e: any) {
    console.error("RZP verify fatal error", e);
    dbg.push({ step: "fatal", error: e?.message || String(e) });
    const allowDebug = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Failed",
        debug: allowDebug ? dbg : undefined,
      },
      { status: 500 }
    );
  }
}
