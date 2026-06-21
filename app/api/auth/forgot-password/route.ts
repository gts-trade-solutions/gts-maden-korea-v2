import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/ses";
import { getEmailTranslator } from "@/lib/i18n/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_MESSAGE =
  "If an account exists for this email, a reset link has been sent.";
const DELIVERY_FAILURE_MESSAGE =
  "We couldn't send the reset email right now. Please try again later or contact support.";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findAuthUserByEmail(supabase: any, email: string) {
  const target = email.toLowerCase();
  const perPage = 200;
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find(
      (u: any) => (u?.email || "").toLowerCase() === target
    );
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const emailRaw = String(body?.email || "").trim();
    const email = emailRaw.toLowerCase();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({
        success: true,
        message: GENERIC_MESSAGE,
        deliveryStatus: "accepted",
      });
    }

    const supabase = createServiceClient();
    const user = await findAuthUserByEmail(supabase as any, email);

    let deliveryStatus: "accepted" | "sent" | "failed" = "accepted";
    let success = true;
    let message = GENERIC_MESSAGE;

    if (user?.id) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 1000 * 60 * 30).toISOString();

      const { error: invalidateError } = await supabase
        .from("password_reset_tokens")
        .update({ used_at: now.toISOString() })
        .eq("email", email)
        .is("used_at", null);

      if (invalidateError) {
        console.error("[forgot-password] token invalidate failed:", invalidateError);
        return NextResponse.json({
          success: false,
          message: DELIVERY_FAILURE_MESSAGE,
          deliveryStatus: "failed",
        });
      }

      const { error: insertError } = await supabase
        .from("password_reset_tokens")
        .insert({
          email,
          token_hash: tokenHash,
          expires_at: expiresAt,
        });

      if (!insertError) {
        const appBase =
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.APP_URL ||
          req.nextUrl.origin;
        const resetUrl = `${appBase}/auth/reset?token=${encodeURIComponent(
          token
        )}`;
        const resetFrom ="info@madenkorea.com";
        const sesRegion =
          process.env.AWS_SES_REGION ||
          process.env.SES_REGION ||
          process.env.AWS_REGION ||
          "";

        try {
          console.log("[forgot-password] attempting SES send", {
            email,
            userId: user.id,
            sender: resetFrom || "(empty)",
            sesRegion: sesRegion || "(empty)",
          });

          // Locale comes from the device that just requested the reset
          // (cookie is fresh and reflects what they were just reading).
          // The user's stored `preferred_locale` could also be used,
          // but a fresh cookie is more reliably current than a profile
          // value that may be stale from another device.
          const requestLocale = cookies().get("mik_locale")?.value || null;
          const { t: tEmail } = await getEmailTranslator(requestLocale);

          await sendEmail({
            to: email,
            from: resetFrom,
            subject: tEmail("passwordReset.subject"),
            html: `
              <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #111827; background-color: #f9fafb; padding: 24px">
                <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; padding: 24px">
                  <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 600">
                    ${tEmail("passwordReset.heading")}
                  </h2>
                  <p style="margin: 0 0 14px; color: #4b5563">
                    ${tEmail("passwordReset.intro")}
                  </p>
                  <p style="margin: 0 0 18px">
                    <a href="${resetUrl}" style="display: inline-block; padding: 10px 18px; border-radius: 999px; background: #111827; color: #f9fafb; font-weight: 500; text-decoration: none">
                      ${tEmail("passwordReset.cta")}
                    </a>
                  </p>
                  <p style="margin: 0 0 10px; color: #6b7280; font-size: 12px">
                    ${tEmail("passwordReset.fallbackPrefix")}<br />
                    <span style="word-break: break-all">${resetUrl}</span>
                  </p>
                  <p style="margin: 0 0 6px; color: #6b7280; font-size: 12px">
                    ${tEmail("passwordReset.expiryNotice", { minutes: 30 })}
                  </p>
                  <p style="margin: 0; color: #6b7280; font-size: 12px">
                    ${tEmail("passwordReset.ignoreNotice")}
                  </p>
                  <p style="margin: 18px 0 0; color: #4b5563; font-size: 13px">
                    — ${tEmail("passwordReset.signoff")}
                  </p>
                </div>
              </div>
            `,
          });
          console.log("[forgot-password] SES send success", {
            email,
            userId: user.id,
          });
          deliveryStatus = "sent";
        } catch (mailError) {
          console.error("[forgot-password] email send failed:", {
            email,
            userId: user.id,
            reason:
              mailError instanceof Error ? mailError.message : String(mailError),
            sender: resetFrom || "(empty)",
            sesRegion: sesRegion || "(empty)",
            hasAppUrl:
              !!process.env.NEXT_PUBLIC_APP_URL ||
              !!process.env.APP_URL ||
              !!req.nextUrl.origin,
            hasRegion:
              !!process.env.AWS_SES_REGION ||
              !!process.env.SES_REGION ||
              !!process.env.AWS_REGION,
            hasAccessKey: !!process.env.SES_ACCESS_KEY_ID,
            hasSecret: !!process.env.SES_SECRET_ACCESS_KEY,
            hasFrom: !!process.env.AWS_FROM_EMAIL || !!process.env.MAIL_FROM,
          });
          success = false;
          message = DELIVERY_FAILURE_MESSAGE;
          deliveryStatus = "failed";
        }
      } else {
        console.error("[forgot-password] token insert failed:", insertError);
        success = false;
        message = DELIVERY_FAILURE_MESSAGE;
        deliveryStatus = "failed";
      }
    }

    return NextResponse.json({
      success,
      message,
      deliveryStatus,
    });
  } catch (error) {
    console.error("[forgot-password] unexpected error:", error);
    return NextResponse.json({
      success: false,
      message: DELIVERY_FAILURE_MESSAGE,
      deliveryStatus: "failed",
    });
  }
}
