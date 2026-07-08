import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Public endpoint: returns the active currency rate table for the
// client `useCurrency()` hook. The data is public by design (it's what
// visitors see on every price tag).
//
// Cached for 5 minutes (Cache-Control) so subsequent visits hit the
// edge cache instead of the DB. The daily refresh job and admin
// "Refresh now" button both bust this when they update rates.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const rates = await prisma.currency_rates.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: {
        code: true, name: true, symbol: true, decimals: true,
        rate_from_inr: true, active: true, last_updated_at: true,
      },
    });

    return NextResponse.json(
      { ok: true, rates: jsonSafe(rates) },
      {
        headers: {
          // Edge cache 5 minutes, stale-while-revalidate 1 hour.
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "no_rates" },
      { status: 500 }
    );
  }
}
