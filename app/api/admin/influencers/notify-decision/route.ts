export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/ses";
import { getEmailTranslator } from "@/lib/i18n/email";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Best-effort SES notification after the admin approves or rejects a
// K-Partnership request. Called from /admin/influencers AFTER the
// approve_influencer / reject_influencer RPC has already succeeded —
// this endpoint just renders + sends the email. If the email fails for
// any reason (SES outage, missing recipient profile, etc.) the admin
// flow is unaffected: we always return 200, with `ok: false` + an
// `error` field so the dashboard can surface it as a toast warning.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });


function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function siteUrl() {
  // Production canonical URL — used in CTA link. Falls back to the
  // public host env vars if SITE_URL isn't set explicitly.
  const url =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.URL ||
    "https://madenkorea.com";
  return url.replace(/\/$/, "");
}

export async function POST(req: Request) {
  const { error: authErr } = await requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const requestId = String(body?.request_id || "").trim();
  const decision = String(body?.decision || "").toLowerCase();
  if (!requestId) return json({ ok: false, error: "REQUEST_ID_REQUIRED" }, 400);
  if (decision !== "approved" && decision !== "rejected") {
    return json({ ok: false, error: "INVALID_DECISION" }, 400);
  }

  const sb = admin();

  // 1) Fetch the request row so we know whose decision this is.
  const { data: request, error: reqErr } = await sb
    .from("influencer_requests")
    .select("id, user_id, handle, status")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) return json({ ok: false, error: reqErr.message }, 500);
  if (!request) return json({ ok: false, error: "REQUEST_NOT_FOUND" }, 404);

  const userId = (request as any).user_id as string;
  if (!userId) return json({ ok: false, error: "MISSING_USER_ID" }, 400);

  // 2) Recipient email comes from auth.users (admin can read it via
  //    the service-role client). Locale comes from profiles so the
  //    template renders in their preferred language.
  const { data: authUser, error: uErr } = await sb.auth.admin.getUserById(userId);
  if (uErr || !authUser?.user?.email) {
    return json({ ok: false, error: "RECIPIENT_EMAIL_MISSING" }, 400);
  }
  const recipientEmail = authUser.user.email;

  const { data: prof } = await sb
    .from("profiles")
    .select("full_name, preferred_locale")
    .eq("id", userId)
    .maybeSingle();
  const recipientName = (prof as any)?.full_name || "there";
  const recipientLocale = (prof as any)?.preferred_locale || null;

  // For the approved email we also surface the influencer's handle so
  // they can recognise it in the inbox. For rejected we don't have an
  // influencer_profiles row so this is approval-only.
  let handle: string | null = (request as any).handle || null;
  if (decision === "approved") {
    const { data: ip } = await sb
      .from("influencer_profiles")
      .select("handle")
      .eq("user_id", userId)
      .maybeSingle();
    if ((ip as any)?.handle) handle = (ip as any).handle;
  }

  // 3) Render the email body. HTML mirrors the existing transactional
  //    template style (centred card, neutral palette, pill, signoff).
  const { t } = await getEmailTranslator(recipientLocale);
  const ns = decision === "approved" ? "influencerApproved" : "influencerRejected";

  const portalUrl = `${siteUrl()}/influencer`;
  const sharedHeader = (pill: string, heading: string) => `
    <div style="display: inline-block; background: ${decision === "approved" ? "#dcfce7" : "#fef3c7"}; color: ${decision === "approved" ? "#166534" : "#92400e"}; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px">
      ${escapeHtml(pill)}
    </div>
    <h2 style="margin: 0 0 12px; font-size: 22px; font-weight: 600; color: #111827">
      ${escapeHtml(heading)}
    </h2>
  `;

  let bodyHtml: string;
  let subject: string;

  if (decision === "approved") {
    subject = t(`${ns}.subject`);
    const heading = t(`${ns}.heading`, { name: recipientName });
    bodyHtml = `
      ${sharedHeader(t(`${ns}.pill`), heading)}
      <p style="margin: 0 0 14px; color: #4b5563">${escapeHtml(t(`${ns}.intro`))}</p>
      ${handle
        ? `<p style="margin: 0 0 18px; color: #111827">
            <strong>${escapeHtml(t(`${ns}.handleLabel`))}:</strong>
            <span style="display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 6px; background: #f3f4f6; font-family: ui-monospace, SFMono-Regular, Menlo, monospace">@${escapeHtml(handle)}</span>
          </p>`
        : ""}
      <h3 style="margin: 18px 0 6px; font-size: 14px; font-weight: 600; color: #111827">
        ${escapeHtml(t(`${ns}.ctaHeading`))}
      </h3>
      <p style="margin: 0 0 12px; color: #4b5563">${escapeHtml(t(`${ns}.ctaBody`))}</p>
      <p style="margin: 0 0 22px">
        <a href="${portalUrl}" style="display: inline-block; padding: 10px 18px; border-radius: 999px; background: #111827; color: #f9fafb; font-weight: 500; text-decoration: none">
          ${escapeHtml(t(`${ns}.ctaButton`))}
        </a>
      </p>
      <h3 style="margin: 18px 0 8px; font-size: 14px; font-weight: 600; color: #111827">
        ${escapeHtml(t(`${ns}.tipsHeading`))}
      </h3>
      <ul style="margin: 0 0 18px; padding-left: 18px; color: #4b5563; line-height: 1.6">
        <li>${escapeHtml(t(`${ns}.tip1`))}</li>
        <li>${escapeHtml(t(`${ns}.tip2`))}</li>
        <li>${escapeHtml(t(`${ns}.tip3`))}</li>
      </ul>
      <p style="margin: 0 0 18px; color: #4b5563">${escapeHtml(t(`${ns}.closing`))}</p>
      <p style="margin: 0; color: #4b5563; font-size: 13px">— ${escapeHtml(t(`${ns}.signoff`))}</p>
    `;
  } else {
    subject = t(`${ns}.subject`);
    const heading = t(`${ns}.heading`, { name: recipientName });
    bodyHtml = `
      ${sharedHeader(t(`${ns}.pill`), heading)}
      <p style="margin: 0 0 14px; color: #4b5563">${escapeHtml(t(`${ns}.intro`))}</p>
      <h3 style="margin: 18px 0 6px; font-size: 14px; font-weight: 600; color: #111827">
        ${escapeHtml(t(`${ns}.reasonHeading`))}
      </h3>
      <p style="margin: 0 0 14px; color: #4b5563">${escapeHtml(t(`${ns}.reasonBody`))}</p>
      <h3 style="margin: 18px 0 6px; font-size: 14px; font-weight: 600; color: #111827">
        ${escapeHtml(t(`${ns}.nextHeading`))}
      </h3>
      <ul style="margin: 0 0 18px; padding-left: 18px; color: #4b5563; line-height: 1.6">
        <li>${escapeHtml(t(`${ns}.next1`))}</li>
        <li>${escapeHtml(t(`${ns}.next2`))}</li>
        <li>${escapeHtml(t(`${ns}.next3`))}</li>
      </ul>
      <p style="margin: 0 0 18px; color: #4b5563">${escapeHtml(t(`${ns}.closing`))}</p>
      <p style="margin: 0; color: #4b5563; font-size: 13px">— ${escapeHtml(t(`${ns}.signoff`))}</p>
    `;
  }

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #111827; background-color: #f9fafb; padding: 24px">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; padding: 24px">
        ${bodyHtml}
      </div>
    </div>
  `;

  try {
    const messageId = await sendEmail({
      to: recipientEmail,
      subject,
      html,
    });
    return json({ ok: true, messageId });
  } catch (err: any) {
    console.error("[admin/notify-decision] SES send failed", {
      requestId,
      decision,
      reason: err?.message,
    });
    // Don't 500 — admin flow already succeeded. Surface the SES error
    // so the dashboard can show a non-fatal toast warning.
    return json({ ok: false, error: err?.message || "SES_SEND_FAILED" });
  }
}

// Minimal HTML-escape. SES treats the body as HTML so any user-supplied
// strings (full_name from profiles, handle) get escaped to prevent
// accidental tag injection.
function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
