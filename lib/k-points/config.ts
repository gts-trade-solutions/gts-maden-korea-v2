import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  SUPPORTED_CURRENCIES,
  FALLBACK_RATES,
  type CurrencyCode,
} from "@/lib/currency";
import {
  DEFAULT_K_POINTS_SETTINGS,
  EARN_ACTIONS,
  type EarnAction,
  type EarnRule,
  type KPointsSettingsValue,
} from "@/lib/k-points/constants";

const CACHE_TTL_MS = 60 * 1000;

// ─── Settings (singleton) ──────────────────────────────────────────
let settingsCache: { value: KPointsSettingsValue; expiresAt: number } | null = null;

export async function getKPointsSettings(): Promise<KPointsSettingsValue> {
  const now = Date.now();
  if (settingsCache && settingsCache.expiresAt > now) return settingsCache.value;
  let value = { ...DEFAULT_K_POINTS_SETTINGS };
  try {
    const row = await prisma.kPointsSettings.findFirst();
    if (row) {
      value = {
        baseCurrency: row.baseCurrency,
        basePointsPerUnit: Number(row.basePointsPerUnit),
        redeemCapPercent: row.redeemCapPercent,
        redeemMinPoints: row.redeemMinPoints,
        pointsExpiryDays: row.pointsExpiryDays,
        skinAnalyzerCostPoints: row.skinAnalyzerCostPoints,
        earnOnNet: row.earnOnNet,
      };
    }
  } catch {
    /* fall back to defaults */
  }
  settingsCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export function bustKPointsSettingsCache() {
  settingsCache = null;
}

// ─── Earn rules ────────────────────────────────────────────────────
let rulesCache: { value: Record<string, EarnRule>; expiresAt: number } | null = null;

export async function getKPointsRules(): Promise<Record<string, EarnRule>> {
  const now = Date.now();
  if (rulesCache && rulesCache.expiresAt > now) return rulesCache.value;
  const value: Record<string, EarnRule> = {};
  try {
    const rows = await prisma.kPointsRule.findMany();
    for (const r of rows) {
      value[r.actionKey] = {
        actionKey: r.actionKey as EarnAction,
        mode: r.mode === "percent" ? "percent" : "flat",
        value: Number(r.value),
        enabled: r.enabled,
        oneTime: r.oneTime,
      };
    }
  } catch {
    /* empty → all actions treated as disabled */
  }
  // Ensure every known action has an entry (disabled default).
  for (const a of EARN_ACTIONS) {
    if (!value[a]) value[a] = { actionKey: a, mode: "flat", value: 0, enabled: false, oneTime: a === "signup" };
  }
  rulesCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export async function getEarnRule(action: EarnAction): Promise<EarnRule> {
  return (await getKPointsRules())[action];
}

export function bustKPointsRulesCache() {
  rulesCache = null;
}

// ─── Currency valuation ────────────────────────────────────────────
let ratesCache:
  | { value: Record<string, { pointsPerUnit: number; isAuto: boolean }>; expiresAt: number }
  | null = null;

async function loadStoredRates() {
  const now = Date.now();
  if (ratesCache && ratesCache.expiresAt > now) return ratesCache.value;
  const value: Record<string, { pointsPerUnit: number; isAuto: boolean }> = {};
  try {
    const rows = await prisma.kPointsCurrencyRate.findMany();
    for (const r of rows)
      value[r.currencyCode] = { pointsPerUnit: Number(r.pointsPerUnit), isAuto: r.isAuto };
  } catch {
    /* none stored yet → auto-derive on demand */
  }
  ratesCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export function bustKPointsRatesCache() {
  ratesCache = null;
}

// Live INR conversion rate for a currency (currency units per 1 INR).
async function rateFromInr(code: string): Promise<number> {
  if (code === "INR") return 1;
  try {
    const r = await prisma.currency_rates.findFirst({
      where: { code, active: true },
      select: { rate_from_inr: true },
    });
    if (r?.rate_from_inr != null) return Number(r.rate_from_inr);
  } catch {
    /* fall through to compiled fallback */
  }
  return FALLBACK_RATES[code as CurrencyCode]?.rate_from_inr ?? 1;
}

// points_per_unit(C) derived from the base so 1 point holds the same value
// everywhere: basePointsPerUnit × rate_from_inr(base) / rate_from_inr(C).
export async function computeAutoPointsPerUnit(code: string): Promise<number> {
  const settings = await getKPointsSettings();
  const [rBase, rC] = await Promise.all([
    rateFromInr(settings.baseCurrency),
    rateFromInr(code),
  ]);
  if (!rC) return settings.basePointsPerUnit;
  return settings.basePointsPerUnit * (rBase / rC);
}

// How many K-Points equal 1 unit of `code` (stored override, else auto).
export async function getPointsPerUnit(code: string): Promise<number> {
  const stored = await loadStoredRates();
  if (stored[code]) return stored[code].pointsPerUnit;
  return computeAutoPointsPerUnit(code);
}

// Full per-currency table for the admin UI (fills gaps with auto values).
export async function getAllPointsRates(): Promise<
  { code: string; pointsPerUnit: number; isAuto: boolean }[]
> {
  const stored = await loadStoredRates();
  const out: { code: string; pointsPerUnit: number; isAuto: boolean }[] = [];
  for (const code of SUPPORTED_CURRENCIES) {
    if (stored[code]) {
      out.push({ code, pointsPerUnit: stored[code].pointsPerUnit, isAuto: stored[code].isAuto });
    } else {
      out.push({ code, pointsPerUnit: await computeAutoPointsPerUnit(code), isAuto: true });
    }
  }
  return out;
}

// Recompute every non-overridden ("auto") currency from the current base and
// persist. Overridden currencies (is_auto = false) are left untouched.
export async function autoConvertAllRates(): Promise<void> {
  const stored = await loadStoredRates();
  for (const code of SUPPORTED_CURRENCIES) {
    if (stored[code] && !stored[code].isAuto) continue; // keep manual overrides
    const ppu = await computeAutoPointsPerUnit(code);
    await prisma.kPointsCurrencyRate.upsert({
      where: { currencyCode: code },
      update: { pointsPerUnit: ppu, isAuto: true },
      create: { currencyCode: code, pointsPerUnit: ppu, isAuto: true },
    });
  }
  bustKPointsRatesCache();
}
