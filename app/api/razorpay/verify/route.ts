import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
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
import { jsonSafe } from "@/lib/db/serialize";
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
      free, // true = fully paid by K-Points (₹0), no Razorpay charge
    } = body || {};
    const isFree = free === true;
    const WANT_DEBUG = ALLOW_DEBUG && (DEBUG || !!__debug);

    dbg.push({
      step: "init",
      env: {
        hasRZPKeyId: !!process.env.RAZORPAY_KEY_ID,
        hasRZPKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
      },
    });

    // Free (₹0, points-only) orders carry no Razorpay ids/signature — only the
    // app order id. Their legitimacy is re-checked server-side below (the order
    // row's total_inr must be ≤ 0). Paid orders require the full signature set.
    if (isFree) {
      if (!app_order_id) {
        return NextResponse.json(
          { ok: false, error: "Missing fields", debug: WANT_DEBUG ? dbg : undefined },
          { status: 400 },
        );
      }
    } else {
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
      dbg.push({ step: "sig", expected, provided: razorpay_signature, ok: sigOk });
      if (!sigOk) {
        const res = {
          ok: false,
          error: "Invalid signature",
          debug: WANT_DEBUG ? dbg : undefined,
        };
        return NextResponse.json(res, { status: 400 });
      }
    }

    // Payment finalization (order load + mark-paid, payment record,
    // attribution, promo-use increment, cart clear) runs directly against
    // MySQL via Prisma — MySQL is the source of truth. Signature verification,
    // the SES emails, and best-effort telemetry (admin bell, server
    // order_placed event, optional DTDC) follow.
    const { prisma } = await import("@/lib/db/prisma");

    // 2) Load order (+ fields we use)
    let order: any = null;
    let oErr: any = null;
    order = await prisma.orders
      .findUnique({
        where: { id: app_order_id },
        select: {
          id: true,
          user_id: true,
          status: true,
          subtotal: true,
          shipping_fee: true,
          discount_total: true,
          total: true,
          subtotal_inr: true,
          shipping_fee_inr: true,
          discount_total_inr: true,
          total_inr: true,
          currency: true,
          fx_rate_snapshot: true,
          recipient_locale: true,
          order_number: true,
          address_snapshot: true,
          promo_code_id: true,
          promo_snapshot: true,
          points_redeemed_amount: true,
          points_redeemed_qty: true,
        },
      })
      .catch((e: any) => {
        oErr = e;
        return null;
      });

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

    // Free path is only valid when the order's remaining total is below the
    // payment minimum (₹1) — re-checked server-side so a client can't claim
    // "free" on a payable order. Matches MIN_CHARGE_INR in razorpay/create.
    if (isFree) {
      const orderTotalInr = Number(
        (order as any).total_inr ?? (order.currency === "INR" ? order.total : NaN),
      );
      if (!(orderTotalInr < 1)) {
        return NextResponse.json(
          { ok: false, error: "Order is not free", debug: WANT_DEBUG ? dbg : undefined },
          { status: 400 },
        );
      }
    }

    // Order currency in a type-narrowed form. Used in every downstream
    // write that records `currency` and in the email formatter. Falls
    // back to INR for legacy rows that pre-date international support.
    const orderCurrencyRaw = order.currency || "INR";
    const orderCurrency: CurrencyCode = isSupportedCurrency(orderCurrencyRaw)
      ? orderCurrencyRaw
      : "INR";

    // 3) Existing attribution?
    let attrib: any = null;
    let aErr: any = null;
    attrib = await prisma.order_attributions
      .findUnique({
        where: { order_id: order.id },
        select: {
          order_id: true,
          influencer_id: true,
          promo_code_id: true,
          attributed_by: true,
          discount_percent: true,
          commission_percent: true,
          commission_amount: true,
          currency: true,
          status: true,
        },
      })
      .catch((e: any) => {
        aErr = e;
        return null;
      });
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
      const promo = await prisma.promo_codes
        .findUnique({
          where: { id },
          select: {
            id: true,
            influencer_id: true,
            discount_percent: true,
            commission_percent: true,
          },
        })
        .catch(() => null);
      dbg.push({ step: "promo.lookup", id, promo });
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

    // Fetch RZP order (to get notes + amount_paid). Skipped for free orders,
    // which have no Razorpay order.
    let ro: any = null;
    if (!isFree && razorpay_order_id) {
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
      const settings = await prisma.store_settings.findUnique({
        where: { id: 1 },
        select: { commission_auto_approve_days: true },
      });
      const rawDays = Number((settings as any)?.commission_auto_approve_days);
      autoApproveDays =
        Number.isFinite(rawDays) && rawDays >= 0 ? Math.floor(rawDays) : 0;
    } catch (e: any) {
      dbg.push({ step: "settings.auto_approve.error", error: e?.message });
    }
    const initialAttribStatus: "pending" | "approved" =
      autoApproveDays === 0 ? "approved" : "pending";

    // 5b) Write attribution robustly (insert then update).
    // Currency always 'INR' so dashboard sums + payout availability
    // math never mix currencies regardless of the buyer's currency.
    if (influencerId) {
      try {
        const { upsertOrderAttribution } = await import("@/lib/data/payments");
        await upsertOrderAttribution({
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
        dbg.push({ step: "attrib.upsert", ok: true });
      } catch (e: any) {
        dbg.push({ step: "attrib.upsert", error: e?.message });
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
    // Free (points-only) orders were charged nothing in money.
    const paidAmount = isFree
      ? 0
      : ro && typeof ro.amount_paid === "number"
        ? money(fromRazorpayMinorUnits(ro.amount_paid, orderCurrency))
        : computedFinal;

    let updOrderErrorMsg: string | undefined;
    try {
      const { updateOrderRow } = await import("@/lib/data/payments");
      await updateOrderRow(order.id, {
        status: "paid",
        discount_total: discountAmount,
        total: paidAmount,
        // Free orders paid nothing in money — zero the INR total too (create may
        // have persisted a sub-₹1 residual that was waived).
        ...(isFree ? { total_inr: 0 } : {}),
        payment_provider: isFree ? "k_points" : "razorpay",
        payment_reference: isFree ? `kpoints:${order.id}` : razorpay_payment_id,
        payment_meta: raw ? { raw } : null,
        paid_at: new Date(),
      });
    } catch (e: any) {
      updOrderErrorMsg = e?.message || String(e);
    }

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
      await prisma.payments.create({
        data: {
          id: crypto.randomUUID(),
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
        },
      });
      dbg.push({ step: "payments.insert" });
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
        const prof = await prisma.profiles.findUnique({
          where: { id: order.user_id },
          select: { tracking_consent: true },
        });
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

        const eventProps = {
          order_id: order.id,
          order_number: order.order_number ?? null,
          subtotal: order.subtotal,
          shipping_fee: order.shipping_fee,
          discount_total: discountAmount,
          total: paidAmount,
          provider_payment_id: razorpay_payment_id,
          provider_order_id: razorpay_order_id,
        };

        // `anon_id`/`session_id` are NOT NULL in MySQL, so coalesce to "" when
        // identity is unavailable. jsonSafe() coerces Prisma Decimal
        // (subtotal/shipping_fee) → Number so the JSON `props` column stores
        // plain values.
        await prisma.events.create({
          data: {
            id: crypto.randomUUID(),
            user_id: order.user_id ?? null,
            anon_id: anonId ?? "",
            session_id: sessionId ?? "",
            event_name: "order_placed",
            path: "/api/razorpay/verify",
            props: jsonSafe(eventProps) as any,
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
        const existing = await prisma.dtdc_shipments.findFirst({
          where: { order_id: order.id, is_active: true },
          select: { id: true },
        });
        if (!existing) {
          const { createDtdcShipmentForOrder } = await import(
            "@/lib/dtdc/createShipmentForOrder"
          );
          await createDtdcShipmentForOrder(prisma, order.id, {
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
      error: updOrderErrorMsg,
      write: { discountAmount, paidAmount, shippingFee },
    });
    if (updOrderErrorMsg) {
      const res = {
        ok: false,
        error: updOrderErrorMsg,
        debug: WANT_DEBUG ? dbg : undefined,
      };
      return NextResponse.json(res, { status: 500 });
    }

    // 7) Promo uses (best-effort). Port of increment_promo_use: bump `uses`
    // only while the code is still active and under its max_uses guard (verify
    // is idempotent — the paid-status gate above stops it running twice per
    // order). When the increment hits max_uses we flip `active` off so the
    // MySQL checkout resolver stops honoring an exhausted code.
    if (promoCodeId) {
      try {
        const promo = await prisma.promo_codes.findUnique({
          where: { id: promoCodeId },
          select: { uses: true, max_uses: true, active: true },
        });
        if (
          promo &&
          promo.active &&
          (promo.max_uses == null || (promo.uses ?? 0) < promo.max_uses)
        ) {
          const newUses = (promo.uses ?? 0) + 1;
          const exhausted =
            promo.max_uses != null && newUses >= promo.max_uses;
          await prisma.promo_codes.update({
            where: { id: promoCodeId },
            data: { uses: newUses, ...(exhausted ? { active: false } : {}) },
          });
          dbg.push({ step: "promo.uses", incremented: true, exhausted });
        } else {
          dbg.push({ step: "promo.uses", incremented: false });
        }
      } catch (e: any) {
        dbg.push({ step: "promo.uses", error: e?.message });
      }
    }

    // 8) Clear cart — MySQL is authoritative, clearCartMysql IS the clear.
    if (order.user_id) {
      try {
        const { clearCartMysql } = await import("@/lib/data/cart");
        await clearCartMysql(order.user_id);
        dbg.push({ step: "cart.clear" });
      } catch (e: any) {
        dbg.push({ step: "cart.clear", error: e?.message });
      }
    }

    // 8a2) Settle any reserved K-Points redemption for this order (best-effort,
    // idempotent). The reduced amount was already charged at create time.
    if (order.user_id) {
      try {
        const qty = Number((order as any).points_redeemed_qty) || 0;
        if (qty > 0) {
          const { settle } = await import("@/lib/k-points/service");
          await settle(order.id, qty);
          dbg.push({ step: "kpoints.settle", qty });
        }
      } catch (e: any) {
        dbg.push({ step: "kpoints.settle", error: e?.message });
      }
    }

    // 8b) Credit K-Points earned on this purchase (best-effort, idempotent
    // per order id). Earn on the net INR paid (excludes any points-redeemed
    // portion; that column is 0 until the redemption phase ships).
    if (order.user_id) {
      try {
        const { getEarnRule, getKPointsSettings } = await import("@/lib/k-points/config");
        const { earn, pointsForSpendInr } = await import("@/lib/k-points/service");
        const rule = await getEarnRule("purchase");
        if (rule.enabled) {
          const settings = await getKPointsSettings();
          const redeemedInr = Number((order as any).points_redeemed_amount ?? 0) || 0;
          const netInr = settings.earnOnNet ? baseInr - redeemedInr : baseInr;
          const pts = await pointsForSpendInr(Math.max(0, netInr), rule);
          if (pts > 0) {
            await earn({
              userId: order.user_id,
              points: pts,
              reason: "purchase",
              sourceType: "order",
              sourceId: order.id,
              meta: { orderNumber: order.order_number ?? null, netInr },
            });
            dbg.push({ step: "kpoints.earn", points: pts });
          }
        }
      } catch (e: any) {
        dbg.push({ step: "kpoints.earn", error: e?.message });
      }
    }

    // 8b2) Referral bonus for the buyer on an attributed (referred) order.
    if (order.user_id && influencerId) {
      try {
        const { getEarnRule } = await import("@/lib/k-points/config");
        const { earn, pointsForSpendInr } = await import("@/lib/k-points/service");
        const rule = await getEarnRule("referral");
        if (rule.enabled) {
          const pts = await pointsForSpendInr(Math.max(0, baseInr), rule);
          if (pts > 0) {
            await earn({
              userId: order.user_id,
              points: pts,
              reason: "referral",
              sourceType: "order",
              sourceId: order.id,
              meta: { influencerId },
            });
            dbg.push({ step: "kpoints.referral", points: pts });
          }
        }
      } catch (e: any) {
        dbg.push({ step: "kpoints.referral", error: e?.message });
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
      const orderItemsRaw: any[] | null = await prisma.order_items.findMany({
        where: { order_id: order.id },
        select: {
          name: true,
          sku: true,
          quantity: true,
          unit_price: true,
          line_total: true,
        },
      });
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
        // Profile (full_name) + auth user (email/name) both from MySQL. The
        // storefront authenticates against NextAuth now, so the account email
        // lives in `auth_users` (prisma.user), keyed by the same id as profiles.
        let profile: any = null;
        let authUser: any = null;
        try {
          [profile, authUser] = await Promise.all([
            prisma.profiles.findUnique({
              where: { id: order.user_id },
              select: { full_name: true },
            }),
            prisma.user.findUnique({
              where: { id: order.user_id },
              select: { email: true, name: true },
            }),
          ]);
        } catch (e: any) {
          dbg.push({ step: "user.load", error: e?.message });
        }

        userEmail = authUser?.email ?? null;
        userName = profile?.full_name ?? authUser?.name ?? null;
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
