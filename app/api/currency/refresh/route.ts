import { NextRequest, NextResponse } from "next/server";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// Refresh `currency_rates` from the open.er-api.com free FX feed.
//
// Two entry points share this logic:
//  - Netlify Scheduled Function (daily at 02:00 IST) pings this with
//    `Authorization: Bearer ${CRON_SECRET}`.
//  - Admin "Refresh now" button on /admin/settings/currencies calls
//    this from a signed-in admin session.
//
// open.er-api.com is free, no key, supports 161 currencies including
// all 11 we care about. Returns rates relative to a base currency, so
// we pass `base=INR` and write the raw `rates[code]` value into
// `rate_from_inr` (no inversion needed).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FX_ENDPOINT = "https://open.er-api.com/v6/latest/INR";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;

  // Path 1: cron bearer token.
  if (bearer && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET) {
    return true;
  }

  // Path 2: signed-in admin session (NextAuth). Role is read from `profiles`.
  try {
    const user = await getSessionUser();
    if (!user?.id) return false;
    const profile = await prisma.profiles.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    return profile?.role === "admin" || profile?.role === "super_admin";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  let payload: any;
  try {
    const r = await fetch(FX_ENDPOINT, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `fx upstream ${r.status}` },
        { status: 502 }
      );
    }
    payload = await r.json();
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "fx fetch failed" },
      { status: 502 }
    );
  }

  if (payload?.result !== "success" || !payload?.rates) {
    return NextResponse.json(
      { ok: false, error: "fx invalid response" },
      { status: 502 }
    );
  }

  // Update only the currencies we care about. Anything outside our
  // supported set is ignored — keeps the table tidy.
  const now = new Date();
  const updates: Array<{ code: string; rate_from_inr: number }> = [];
  for (const code of SUPPORTED_CURRENCIES) {
    if (code === "INR") continue; // canonical, always 1
    const rate = Number(payload.rates[code]);
    if (Number.isFinite(rate) && rate > 0) {
      updates.push({ code, rate_from_inr: rate });
    }
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { ok: false, error: "no supported rates in upstream response" },
      { status: 502 }
    );
  }

  // Issue updates in parallel. They're small and the table is tiny.
  const results = await Promise.allSettled(
    updates.map(({ code, rate_from_inr }) =>
      prisma.currency_rates.update({
        where: { code },
        data: { rate_from_inr, last_updated_at: now },
      })
    )
  );

  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => (r.reason as any)?.message ?? String(r.reason));
  if (failed.length) {
    return NextResponse.json(
      { ok: false, updated: updates.length - failed.length, errors: failed },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, updated: updates.length, at: now.toISOString() });
}
