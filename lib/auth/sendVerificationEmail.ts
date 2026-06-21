// lib/auth/sendVerificationEmail.ts
//
// Renders + sends the verification email via SES. Single entry point so
// the signup flow, the resend route, the admin "send now" action, and
// the email-change-approval path all produce identical messaging.
//
// The verification link is built from APP_URL / NEXT_PUBLIC_APP_URL with
// the request origin as a fallback — matches the pattern already used by
// the password-reset flow.

import { sendEmail } from "@/lib/ses";
import { getEmailTranslator } from "@/lib/i18n/email";
import { issueVerificationToken, TOKEN_TTL_MS } from "./emailVerification";

type SendOpts = {
  userId: string;
  email: string;
  /** Locale string (e.g. "en", "pl"). Falls back to default when missing. */
  locale?: string | null;
  /** Origin to build the verification URL on top of. Caller usually
   *  passes `req.nextUrl.origin` so dev / prod / preview each get the
   *  right host. */
  origin?: string | null;
};

export async function sendVerificationEmail(opts: SendOpts): Promise<void> {
  const { userId, email, locale = null, origin = null } = opts;

  const { token } = await issueVerificationToken({ userId, email });

  const appBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    origin ||
    "http://localhost:3000";
  const verifyUrl = `${appBase}/auth/verify-email?token=${encodeURIComponent(token)}`;

  const { t: tEmail } = await getEmailTranslator(locale);

  const from = "info@madenkorea.com";
  const ttlHours = Math.round(TOKEN_TTL_MS / 1000 / 60 / 60);

  await sendEmail({
    to: email,
    from,
    subject: tEmail("verifyEmail.subject"),
    html: `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #111827; background-color: #f9fafb; padding: 24px">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; padding: 24px">
          <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 600">
            ${tEmail("verifyEmail.heading")}
          </h2>
          <p style="margin: 0 0 14px; color: #4b5563">
            ${tEmail("verifyEmail.intro")}
          </p>
          <p style="margin: 0 0 18px">
            <a href="${verifyUrl}" style="display: inline-block; padding: 10px 18px; border-radius: 999px; background: #111827; color: #f9fafb; font-weight: 500; text-decoration: none">
              ${tEmail("verifyEmail.cta")}
            </a>
          </p>
          <p style="margin: 0 0 10px; color: #6b7280; font-size: 12px">
            ${tEmail("verifyEmail.fallbackPrefix")}<br />
            <span style="word-break: break-all">${verifyUrl}</span>
          </p>
          <p style="margin: 0 0 6px; color: #6b7280; font-size: 12px">
            ${tEmail("verifyEmail.expiryNotice", { hours: ttlHours })}
          </p>
          <p style="margin: 0; color: #6b7280; font-size: 12px">
            ${tEmail("verifyEmail.ignoreNotice")}
          </p>
          <p style="margin: 18px 0 0; color: #4b5563; font-size: 13px">
            — ${tEmail("verifyEmail.signoff")}
          </p>
        </div>
      </div>
    `,
  });
}
