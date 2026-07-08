export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Admin currency-rates list read, MySQL-authoritative (Prisma). Mirrors the
// old browser Supabase `select("*")` in app/admin/settings/currencies/page.tsx:
// ordered code asc. The FX refresh + active toggle keep their own endpoints.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const rows = await prisma.currency_rates.findMany({
      select: {
        code: true,
        name: true,
        symbol: true,
        decimals: true,
        rate_from_inr: true,
        active: true,
        last_updated_at: true,
      },
      orderBy: { code: "asc" },
    });
    return json({ ok: true, rows: jsonSafe(rows) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
