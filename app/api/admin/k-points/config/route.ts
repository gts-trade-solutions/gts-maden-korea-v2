import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import {
  getKPointsSettings,
  getKPointsRules,
  getAllPointsRates,
  bustKPointsSettingsCache,
  autoConvertAllRates,
} from "@/lib/k-points/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full K-Points admin config: economics settings, earn rules, per-currency rates.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const [settings, rules, rates] = await Promise.all([
    getKPointsSettings(),
    getKPointsRules(),
    getAllPointsRates(),
  ]);
  return NextResponse.json({
    settings,
    rules: Object.values(rules),
    rates,
    currencies: SUPPORTED_CURRENCIES,
  });
}

// Update the economics singleton.
export async function PATCH(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const prev = await getKPointsSettings();

  const data: Record<string, any> = {};
  if (typeof body.baseCurrency === "string" && SUPPORTED_CURRENCIES.includes(body.baseCurrency)) {
    data.baseCurrency = body.baseCurrency;
  }
  if (Number.isFinite(body.basePointsPerUnit) && body.basePointsPerUnit > 0) {
    data.basePointsPerUnit = body.basePointsPerUnit;
  }
  if (Number.isFinite(body.redeemCapPercent)) {
    data.redeemCapPercent = Math.max(0, Math.min(100, Math.round(body.redeemCapPercent)));
  }
  if (Number.isFinite(body.redeemMinPoints)) {
    data.redeemMinPoints = Math.max(0, Math.round(body.redeemMinPoints));
  }
  if (Number.isFinite(body.pointsExpiryDays)) {
    data.pointsExpiryDays = Math.max(0, Math.round(body.pointsExpiryDays));
  }
  if (Number.isFinite(body.skinAnalyzerCostPoints)) {
    data.skinAnalyzerCostPoints = Math.max(0, Math.round(body.skinAnalyzerCostPoints));
  }
  if (typeof body.earnOnNet === "boolean") data.earnOnNet = body.earnOnNet;
  data.updatedBy = user?.id ?? null;

  await prisma.kPointsSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  bustKPointsSettingsCache();

  // If the base currency or rate changed, recompute all auto-derived currency
  // rates so they never go stale (manual overrides are preserved).
  const baseChanged =
    (data.baseCurrency && data.baseCurrency !== prev.baseCurrency) ||
    (data.basePointsPerUnit != null && data.basePointsPerUnit !== prev.basePointsPerUnit);
  if (baseChanged) await autoConvertAllRates();

  return NextResponse.json({
    ok: true,
    settings: await getKPointsSettings(),
    rates: await getAllPointsRates(),
  });
}
