// app/api/me/display-currency/route.ts
//
// Influencer-scoped GET/PATCH for the locked dashboard display
// currency. Stored as `influencer_profiles.display_currency` (default
// 'INR'). Source of truth for commissions stays INR — this only
// controls how amounts are rendered on /influencer/*. Influencer
// self-serves; admin can override from /admin/influencers later
// (separate endpoint, future).

import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
} from "@/lib/currency";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, sb } = await getRouteAuth(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (process.env.CATALOG_BACKEND === "mysql") {
    try {
      const { getDisplayCurrencyMysql } = await import("@/lib/data/influencer");
      return NextResponse.json({
        ok: true,
        display_currency: await getDisplayCurrencyMysql(user.id),
        supported: SUPPORTED_CURRENCIES,
      });
    } catch (e) {
      console.error("[me/display-currency] MySQL read failed, falling back to Supabase:", e);
    }
  }

  const { data, error } = await sb
    .from("influencer_profiles")
    .select("display_currency")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    display_currency: data?.display_currency || "INR",
    supported: SUPPORTED_CURRENCIES,
  });
}

export async function PATCH(req: NextRequest) {
  const { user } = await getRouteAuth(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  // NextAuth has no Supabase session — the influencer_profiles update + the
  // mirror read need a service-role client scoped by user.id.
  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(user.id);
  const body = await req.json().catch(() => ({}));
  const next = String(body.display_currency || "").toUpperCase();
  if (!isSupportedCurrency(next)) {
    return NextResponse.json(
      { ok: false, error: "INVALID_CURRENCY" },
      { status: 400 }
    );
  }
  const { error } = await sb
    .from("influencer_profiles")
    .update({ display_currency: next, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  }

  // Mirror the change into MySQL (the GET reads display_currency from MySQL).
  try {
    const { mirrorInfluencerProfileIntoMysql } = await import("@/lib/data/influencer");
    await mirrorInfluencerProfileIntoMysql(sb, user.id);
  } catch (e) {
    console.error("[dual-write] display-currency MySQL mirror failed:", e);
  }

  return NextResponse.json({ ok: true, display_currency: next });
}
