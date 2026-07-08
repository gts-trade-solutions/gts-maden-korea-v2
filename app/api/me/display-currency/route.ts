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
import { prisma } from "@/lib/db/prisma";
import {
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
} from "@/lib/currency";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user } = await getRouteAuth(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const row = await prisma.influencer_profiles.findUnique({
    where: { user_id: user.id },
    select: { display_currency: true },
  });
  return NextResponse.json({
    ok: true,
    display_currency: row?.display_currency || "INR",
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
  const body = await req.json().catch(() => ({}));
  const next = String(body.display_currency || "").toUpperCase();
  if (!isSupportedCurrency(next)) {
    return NextResponse.json(
      { ok: false, error: "INVALID_CURRENCY" },
      { status: 400 }
    );
  }

  try {
    await prisma.influencer_profiles.update({
      where: { user_id: user.id },
      data: { display_currency: next, updated_at: new Date() },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "UPDATE_FAILED" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, display_currency: next });
}
