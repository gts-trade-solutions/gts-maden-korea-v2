// middleware.ts
//
// Two responsibilities:
//   1. Seed visitor preference cookies on first visit:
//      - `mik_country` (geo-detected)
//      - `mik_currency` (from country profile, falling back to legacy
//        `currencyForCountry`)
//      - `mik_locale`   (from country profile's defaultLocale)
//      Once any cookie is set we never overwrite it — explicit user
//      choice always wins.
//   2. Refresh Supabase auth cookies on routes that depend on a
//      logged-in session (/account, /admin, /checkout, /vendor,
//      /auth/callback).
//
// next-intl URL routing is intentionally NOT wired here. Phase 2.1
// resolves locale via the `mik_locale` cookie in `i18n/request.ts`,
// so URLs stay flat. Phase 2.4 will introduce the URL-prefix
// migration in a separate, focused change.

import { NextResponse } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import type { NextRequest } from "next/server";
import { currencyForCountry, isSupportedCurrency } from "@/lib/currency";
import { getCountryProfile, isSupportedCountry } from "@/lib/countries";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/locales";

const CURRENCY_COOKIE = "mik_currency";
const COUNTRY_COOKIE = "mik_country";
const LOCALE_COOKIE = "mik_locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Detect visitor country from host-provided geo headers. Order matters
 * — we trust the host that's actually serving the request first.
 * Falls back to null when no header is present (local dev).
 */
function detectCountry(req: NextRequest): string | null {
  const fromReq = (req as any).geo?.country;
  if (typeof fromReq === "string" && fromReq) return fromReq.toUpperCase();

  const candidates = [
    req.headers.get("x-nf-country"),
    req.headers.get("x-vercel-ip-country"),
    req.headers.get("cf-ipcountry"),
  ];
  for (const c of candidates) {
    if (c && c !== "XX") return c.toUpperCase();
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // ──────────────────────────────────────────────────────────────
  // Preference cookie auto-seed. Reads cheap headers, sets at most
  // three cookies the first time we see this visitor.
  // ──────────────────────────────────────────────────────────────
  const existingCurrency = req.cookies.get(CURRENCY_COOKIE)?.value;
  const existingCountry = req.cookies.get(COUNTRY_COOKIE)?.value;
  const existingLocale = req.cookies.get(LOCALE_COOKIE)?.value;

  const hasCurrency = existingCurrency && isSupportedCurrency(existingCurrency);
  const hasCountry = existingCountry && isSupportedCountry(existingCountry);
  const hasLocale = existingLocale && isSupportedLocale(existingLocale);

  let response: NextResponse | null = null;

  if (!hasCurrency || !hasCountry || !hasLocale) {
    const detected = detectCountry(req);
    const profile = getCountryProfile(detected);
    response = NextResponse.next();

    if (!hasCurrency) {
      const seededCurrency = profile?.defaultCurrency ?? currencyForCountry(detected);
      response.cookies.set(CURRENCY_COOKIE, seededCurrency, {
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
      });
    }
    if (!hasCountry && detected) {
      response.cookies.set(COUNTRY_COOKIE, detected, {
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
      });
    }
    if (!hasLocale) {
      const seededLocale = profile?.defaultLocale ?? DEFAULT_LOCALE;
      response.cookies.set(LOCALE_COOKIE, seededLocale, {
        path: "/",
        maxAge: COOKIE_MAX_AGE,
        sameSite: "lax",
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Supabase session refresh — only on routes that rely on auth.
  //
  // Under AUTH_BACKEND=nextauth the storefront uses NextAuth (its JWT is
  // validated per-request by the routes; no cookie refresh needed), so we only
  // keep the Supabase refresh for the VENDOR app, which is still on Supabase
  // Auth. The preference-cookie seeding above runs for everyone regardless.
  // ──────────────────────────────────────────────────────────────
  const isVendorProtected =
    pathname.startsWith("/vendor") &&
    pathname !== "/vendor/login" &&
    pathname !== "/vendor/register";

  const needsSessionRefresh =
    process.env.AUTH_BACKEND === "nextauth"
      ? isVendorProtected
      : pathname.startsWith("/account") ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/checkout") ||
        isVendorProtected ||
        pathname.startsWith("/auth/callback");

  if (!needsSessionRefresh) {
    return response ?? NextResponse.next();
  }

  const res = response ?? NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getSession();
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?|ttf|map)$).*)",
  ],
};
