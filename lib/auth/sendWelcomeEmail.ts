// lib/auth/sendWelcomeEmail.ts
//
// Renders + sends the welcome email via SES. Fires once at signup,
// parallel to the verification email (which is the transactional gate
// for account access). The welcome email is "soft" — it conveys brand
// + value props + a curated row of trending products to nudge the new
// shopper into the storefront.
//
// Trending products are best-effort: if the DB call fails or returns
// nothing, the email goes out without the product strip. Prices are
// intentionally omitted from the email — visitors click through to the
// storefront where country-aware pricing + currency rendering happen
// natively, avoiding stale FX rates in a long-lived email.

import { createServiceClient } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/ses";
import { getEmailTranslator } from "@/lib/i18n/email";
import { resolveMediaUrl } from "@/lib/storage/backend";

type SendOpts = {
  email: string;
  /** Display name to personalise the greeting. Optional. */
  name?: string | null;
  /** ISO-2 country (for the storefront link's resolved context).
   *  Not strictly required; the storefront reads the visitor's own
   *  cookie when they arrive. */
  country?: string | null;
  /** Locale string (e.g. "en", "pl"). Falls back to default when missing. */
  locale?: string | null;
  /** Origin to build absolute URLs against. Usually req.nextUrl.origin. */
  origin?: string | null;
};

const MAX_TRENDING = 6;
const PRODUCT_MEDIA_BUCKET = "product-media";

type TrendingProduct = {
  id: string;
  slug: string;
  name: string | null;
  hero_image_path: string | null;
};

async function fetchTrending(): Promise<TrendingProduct[]> {
  try {
    const sb = createServiceClient();
    const { data } = await sb
      .from("products")
      .select("id, slug, name, hero_image_path, is_trending, is_published")
      .eq("is_published", true)
      .eq("is_trending", true)
      .limit(MAX_TRENDING);
    return ((data ?? []) as any[]).map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      hero_image_path: p.hero_image_path,
    }));
  } catch (e) {
    console.error("[welcome-email] trending fetch failed:", e);
    return [];
  }
}

function buildImageUrl(path: string | null): string | null {
  if (!path) return null;
  return resolveMediaUrl(PRODUCT_MEDIA_BUCKET, path) ?? null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendWelcomeEmail(opts: SendOpts): Promise<void> {
  const { email, name = null, locale = null, origin = null } = opts;

  const appBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    origin ||
    "http://localhost:3000";

  const { t: tEmail } = await getEmailTranslator(locale);
  const trimmedName = (name ?? "").trim();
  const hasName = trimmedName.length > 0;

  // Fetch trending in parallel with the email translator (already
  // awaited above, but we keep this pattern to make adding more pre-
  // render work later easy).
  const trending = await fetchTrending();

  // Build the product strip. Email-safe table layout (no flex/grid) —
  // some clients still render quirks with newer CSS. Two columns max so
  // mobile clients show two products side-by-side without overflow.
  const trendingRows: string[] = [];
  for (let i = 0; i < trending.length; i += 2) {
    const left = trending[i];
    const right = trending[i + 1];
    const renderCell = (p: TrendingProduct | undefined) => {
      if (!p) return `<td style="width: 50%; padding: 8px"></td>`;
      const imgUrl = buildImageUrl(p.hero_image_path);
      const productUrl = `${appBase}/products/${encodeURIComponent(p.slug)}`;
      return `
        <td style="width: 50%; padding: 8px; vertical-align: top">
          <a href="${productUrl}" style="text-decoration: none; color: inherit">
            ${
              imgUrl
                ? `<img src="${imgUrl}" alt="${escapeHtml(p.name ?? "Product")}" style="display: block; width: 100%; max-width: 240px; height: auto; border-radius: 8px; border: 1px solid #e5e7eb" />`
                : ""
            }
            <p style="margin: 8px 0 0; font-size: 13px; font-weight: 500; color: #111827; line-height: 1.35">
              ${escapeHtml(p.name ?? "")}
            </p>
          </a>
        </td>
      `;
    };
    trendingRows.push(
      `<tr>${renderCell(left)}${renderCell(right)}</tr>`
    );
  }

  const trendingHtml =
    trending.length > 0
      ? `
    <div style="margin-top: 28px">
      <h3 style="margin: 0 0 6px; font-size: 15px; font-weight: 600; color: #111827">
        ${tEmail("welcomeEmail.trendingHeading")}
      </h3>
      <p style="margin: 0 0 12px; color: #6b7280; font-size: 13px">
        ${tEmail("welcomeEmail.trendingIntro")}
      </p>
      <table style="width: 100%; border-collapse: separate; border-spacing: 0">
        ${trendingRows.join("")}
      </table>
    </div>
    `
      : "";

  const subject = hasName
    ? tEmail("welcomeEmail.subject", { name: trimmedName })
    : tEmail("welcomeEmail.subjectNoName");
  const heading = hasName
    ? tEmail("welcomeEmail.heading", { name: trimmedName })
    : tEmail("welcomeEmail.headingNoName");

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #111827; background-color: #f9fafb; padding: 24px">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; padding: 24px">
        <h2 style="margin: 0 0 12px; font-size: 22px; font-weight: 600">
          ${escapeHtml(heading)}
        </h2>
        <p style="margin: 0 0 14px; color: #4b5563; line-height: 1.55">
          ${tEmail("welcomeEmail.intro")}
        </p>

        <blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #111827; background: #f9fafb; color: #374151; font-style: italic; font-size: 14px; line-height: 1.5">
          ${tEmail("welcomeEmail.pullQuote")}
        </blockquote>

        <h3 style="margin: 22px 0 8px; font-size: 15px; font-weight: 600; color: #111827">
          ${tEmail("welcomeEmail.valuesHeading")}
        </h3>
        <ul style="margin: 0 0 12px 18px; padding: 0; color: #4b5563; font-size: 13px; line-height: 1.6">
          <li>${tEmail("welcomeEmail.valuePremium")}</li>
          <li>${tEmail("welcomeEmail.valueReach")}</li>
          <li>${tEmail("welcomeEmail.valueCustomer")}</li>
          <li>${tEmail("welcomeEmail.valueAuthentic")}</li>
        </ul>

        ${trendingHtml}

        <p style="margin: 24px 0 0">
          <a href="${appBase}" style="display: inline-block; padding: 10px 18px; border-radius: 999px; background: #111827; color: #f9fafb; font-weight: 500; text-decoration: none">
            ${tEmail("welcomeEmail.shopCta")}
          </a>
        </p>

        <p style="margin: 20px 0 0; color: #4b5563; font-size: 13px">
          ${tEmail("welcomeEmail.signoff")}<br />
          <strong>${tEmail("welcomeEmail.signoffName")}</strong>
        </p>
      </div>
      <p style="margin: 16px auto 0; max-width: 560px; text-align: center; color: #9ca3af; font-size: 11px">
        ${tEmail("welcomeEmail.footer")}
      </p>
    </div>
  `;

  await sendEmail({
    to: email,
    from: "info@madenkorea.com",
    subject,
    html,
  });
}
