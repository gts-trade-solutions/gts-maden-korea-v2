export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getRouteUser } from "@/lib/auth/routeUser";
import {
  isSupportedCountry,
  COUNTRY_PROFILES,
  type CountryCode,
} from "@/lib/countries";
import { isSupportedCurrency } from "@/lib/currency";
import { isSupportedLocale } from "@/lib/locales";

// Persist the visitor's country choice. Used by:
//   • the sign-up form (after auth.signUp, write the country picked
//     during registration)
//   • the <CountryGate> modal (for authenticated users without a
//     preferred_country on their profile)
//
// Side effects:
//   1. Updates `public.profiles.preferred_country` for the calling user.
//   2. Writes the `mik_country` cookie so the rest of the session
//      immediately reflects the choice (prices, K-Partnership offers,
//      shipping math, etc.).
//   3. Optionally cascades the country profile's default currency to
//      `mik_currency` and default locale to `mik_locale` IF those
//      cookies are currently absent / unsupported — never overwrites a
//      user's explicit currency/locale choice.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw = String(body?.country ?? body?.country_code ?? "")
    .trim()
    .toUpperCase();
  if (!isSupportedCountry(raw)) {
    return json({ ok: false, error: "UNSUPPORTED_COUNTRY" }, 400);
  }
  const country = raw as CountryCode;

  // Authenticate the caller via Supabase cookies (preferred) OR a
  // Bearer token (newly-registered users whose cookies haven't been
  // attached yet via /api/auth/attach). Either path resolves to a
  // user id; if neither works, 401.
  const cookieStore = cookies();
  const userId = (await getRouteUser(req))?.id ?? null;
  if (!userId) return json({ ok: false, error: "UNAUTH" }, 401);

  // Service-role client for the profile write. RLS would allow the
  // user to update their own row, but using service-role here keeps
  // the path identical whether the caller authed via cookies or
  // bearer, and avoids a separate Supabase client per branch.
  const sbAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error: upErr } = await sbAdmin
    .from("profiles")
    .update({ preferred_country: country, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  // Dual-write to MySQL profiles (the NextAuth profile path reads MySQL).
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.profiles.update({ where: { id: userId }, data: { preferred_country: country } });
  } catch (e) {
    console.error("[dual-write] me/country MySQL update failed:", e);
  }

  // Build the response and set the cookies. `mik_country` always
  // updates to the new choice. Currency + locale cookies only update
  // if currently missing / unsupported — never stomp on an explicit
  // setting the user might have made via the country switcher.
  const profile = COUNTRY_PROFILES[country];
  const res = json({ ok: true, country });

  res.cookies.set("mik_country", country, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  const existingCurrency = cookieStore.get("mik_currency")?.value;
  if (!existingCurrency || !isSupportedCurrency(existingCurrency)) {
    res.cookies.set("mik_currency", profile.defaultCurrency, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  const existingLocale = cookieStore.get("mik_locale")?.value;
  if (!existingLocale || !isSupportedLocale(existingLocale)) {
    res.cookies.set("mik_locale", profile.defaultLocale, {
      path: "/",
      maxAge: COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  return res;
}
