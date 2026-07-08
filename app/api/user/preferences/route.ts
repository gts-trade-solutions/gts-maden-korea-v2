// app/api/user/preferences/route.ts
//
// Persists the visitor's preferred locale + country to their profile
// so they get the same UI/region across browsers on the next sign-in.
//
// Cookies (`mik_locale`, `mik_country`, `mik_currency`) remain the
// per-device source of truth — this endpoint is just a write-through
// so we can hydrate the cookies from the profile after login on a
// fresh device. Currency is intentionally NOT stored on the profile
// because it's a display-only preference and a country implies a
// natural default currency.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isSupportedLocale } from "@/lib/locales";
import { isSupportedCountry } from "@/lib/countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const preferredLocale = body?.preferred_locale;
  const preferredCountry = body?.preferred_country;

  // Reject unknown values rather than letting them land in the DB.
  // Each field is optional individually but at least one must be a
  // valid supported value or the call is pointless.
  const localeOk =
    preferredLocale === undefined ||
    preferredLocale === null ||
    isSupportedLocale(preferredLocale);
  const countryOk =
    preferredCountry === undefined ||
    preferredCountry === null ||
    isSupportedCountry(preferredCountry);

  if (!localeOk || !countryOk) {
    return NextResponse.json(
      { error: "Unsupported locale or country" },
      { status: 422 }
    );
  }

  const updates: Record<string, string | null> = {};
  if (preferredLocale !== undefined) updates.preferred_locale = preferredLocale ?? null;
  if (preferredCountry !== undefined) updates.preferred_country = preferredCountry ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Provide preferred_locale and/or preferred_country" },
      { status: 400 }
    );
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Persist to MySQL profiles (read by the NextAuth profile path).
  try {
    await prisma.profiles.update({ where: { id: userId }, data: updates as any });
  } catch (e: any) {
    console.error("[preferences] MySQL update failed:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to update preferences" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let data: { preferred_locale: string | null; preferred_country: string | null } | null;
  try {
    data = await prisma.profiles.findUnique({
      where: { id: userId },
      select: { preferred_locale: true, preferred_country: true },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to read preferences" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    preferred_locale: data?.preferred_locale ?? null,
    preferred_country: data?.preferred_country ?? null,
  });
}
