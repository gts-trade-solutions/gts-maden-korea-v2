import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import {
  autoConvertAllRates,
  bustKPointsRatesCache,
  computeAutoPointsPerUnit,
  getAllPointsRates,
} from "@/lib/k-points/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { action: "auto-convert" }  → recompute all non-overridden currencies
// POST { action: "reset", code }   → drop a manual override back to auto
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const body = await req.json().catch(() => ({}));

  if (body.action === "auto-convert") {
    await autoConvertAllRates();
    return NextResponse.json({ ok: true, rates: await getAllPointsRates() });
  }

  if (body.action === "reset" && SUPPORTED_CURRENCIES.includes(body.code)) {
    const ppu = await computeAutoPointsPerUnit(body.code);
    await prisma.kPointsCurrencyRate.upsert({
      where: { currencyCode: body.code },
      update: { pointsPerUnit: ppu, isAuto: true },
      create: { currencyCode: body.code, pointsPerUnit: ppu, isAuto: true },
    });
    bustKPointsRatesCache();
    return NextResponse.json({ ok: true, rates: await getAllPointsRates() });
  }

  return NextResponse.json({ ok: false, error: "BAD_ACTION" }, { status: 400 });
}

// Manually override one currency's points-per-unit (pins it, is_auto = false).
export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const body = await req.json().catch(() => ({}));

  const code = String(body.code || "");
  if (!SUPPORTED_CURRENCIES.includes(code as any)) {
    return NextResponse.json({ ok: false, error: "BAD_CURRENCY" }, { status: 400 });
  }
  if (!Number.isFinite(body.pointsPerUnit) || body.pointsPerUnit <= 0) {
    return NextResponse.json({ ok: false, error: "BAD_VALUE" }, { status: 400 });
  }

  await prisma.kPointsCurrencyRate.upsert({
    where: { currencyCode: code },
    update: { pointsPerUnit: body.pointsPerUnit, isAuto: false },
    create: { currencyCode: code, pointsPerUnit: body.pointsPerUnit, isAuto: false },
  });
  bustKPointsRatesCache();

  return NextResponse.json({ ok: true, rates: await getAllPointsRates() });
}
