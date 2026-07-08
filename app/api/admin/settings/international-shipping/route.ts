export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { isSupportedCountry } from "@/lib/countries";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin CRUD for the per-country international shipping rates and the
// three global slab knobs on store_settings (tare%, buffer%, max-kg).
// India is NOT managed here — that uses the existing
// /api/admin/settings/shipping (threshold + flat fee).
//
// Shape:
//   GET    → { ok, rates: [...all 14 country rows + slab cols + ETA + notes],
//              settings: { tare, buffer, cap } }
//   POST   → upsert one country row (slab columns + active + notes + ETA)
//   PATCH  → update the three global settings on store_settings
//   DELETE → hard-delete one country row (soft-disable via active=false preferred)

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const SLAB_COLS = [
  "slab_500g_inr",
  "slab_1kg_inr",
  "slab_2kg_inr",
  "slab_3kg_inr",
  "slab_5kg_inr",
  "slab_7kg_inr",
  "slab_10kg_inr",
  "slab_15kg_inr",
  "slab_20kg_inr",
] as const;

// Explicit column projection to keep the response shape identical to the
// legacy Supabase select (country, active, notes, ETA, updated_at + 9 slabs).
const RATE_SELECT = {
  country: true,
  active: true,
  notes: true,
  eta_days_min: true,
  eta_days_max: true,
  updated_at: true,
  slab_500g_inr: true,
  slab_1kg_inr: true,
  slab_2kg_inr: true,
  slab_3kg_inr: true,
  slab_5kg_inr: true,
  slab_7kg_inr: true,
  slab_10kg_inr: true,
  slab_15kg_inr: true,
  slab_20kg_inr: true,
} as const;

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  let rates;
  let settings;
  try {
    [rates, settings] = await Promise.all([
      prisma.country_shipping_rates.findMany({
        select: RATE_SELECT,
        orderBy: { country: "asc" },
      }),
      prisma.store_settings.findFirst({
        select: {
          intl_packaging_tare_pct: true,
          intl_buffer_pct: true,
          intl_max_shipping_weight_kg: true,
        },
      }),
    ]);
  } catch (dbErr: any) {
    return json({ ok: false, error: dbErr?.message ?? "Read failed" }, 500);
  }

  return json({
    ok: true,
    rates: jsonSafe(rates ?? []),
    settings: {
      intl_packaging_tare_pct:
        Number((settings as any)?.intl_packaging_tare_pct ?? 15),
      intl_buffer_pct: Number((settings as any)?.intl_buffer_pct ?? 20),
      intl_max_shipping_weight_kg: Number(
        (settings as any)?.intl_max_shipping_weight_kg ?? 20
      ),
    },
  });
}

// Upsert one country row.
// Body: { country, slab_500g_inr..slab_20kg_inr, active, notes, eta_days_min, eta_days_max }
export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const country = String(body.country || "").toUpperCase();
  if (!isSupportedCountry(country) || country === "IN") {
    return json({ ok: false, error: "INVALID_COUNTRY" }, 400);
  }

  // All 9 slab values must be present and ≥ 0. We store cleanly rounded
  // to 2 decimals so the table doesn't grow long trailing fractions
  // from FX-driven seeds.
  const slabPayload = {} as Record<(typeof SLAB_COLS)[number], number>;
  for (const c of SLAB_COLS) {
    const v = Number(body[c]);
    if (!Number.isFinite(v) || v < 0) {
      return json({ ok: false, error: `INVALID_SLAB:${c}` }, 400);
    }
    slabPayload[c] = Math.round(v * 100) / 100;
  }

  const active = body.active === undefined ? true : !!body.active;
  const notes = body.notes ? String(body.notes).slice(0, 500) : null;

  const etaMinRaw = body.eta_days_min;
  const etaMaxRaw = body.eta_days_max;
  const hasEta =
    etaMinRaw !== null &&
    etaMinRaw !== undefined &&
    etaMinRaw !== "" &&
    etaMaxRaw !== null &&
    etaMaxRaw !== undefined &&
    etaMaxRaw !== "";
  let etaMin: number | null = null;
  let etaMax: number | null = null;
  if (hasEta) {
    etaMin = Math.floor(Number(etaMinRaw));
    etaMax = Math.floor(Number(etaMaxRaw));
    if (
      !Number.isFinite(etaMin) ||
      !Number.isFinite(etaMax) ||
      etaMin < 0 ||
      etaMax < etaMin ||
      etaMax > 180
    ) {
      return json({ ok: false, error: "INVALID_ETA" }, 400);
    }
  }

  try {
    await prisma.country_shipping_rates.upsert({
      where: { country },
      update: {
        ...slabPayload,
        active,
        notes,
        eta_days_min: etaMin,
        eta_days_max: etaMax,
        updated_at: new Date(),
      },
      create: {
        country,
        ...slabPayload,
        active,
        notes,
        eta_days_min: etaMin,
        eta_days_max: etaMax,
        updated_at: new Date(),
      },
    });
  } catch (upErr: any) {
    return json({ ok: false, error: upErr?.message ?? "Update failed" }, 500);
  }

  return json({ ok: true });
}

// Update the three global slab knobs on store_settings (id=1).
export async function PATCH(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const tare = Math.floor(Number(body.intl_packaging_tare_pct));
  const buffer = Math.floor(Number(body.intl_buffer_pct));
  const cap = Math.floor(Number(body.intl_max_shipping_weight_kg));

  if (!Number.isFinite(tare) || tare < 0 || tare > 100) {
    return json({ ok: false, error: "INVALID_TARE" }, 400);
  }
  if (!Number.isFinite(buffer) || buffer < 0 || buffer > 100) {
    return json({ ok: false, error: "INVALID_BUFFER" }, 400);
  }
  if (!Number.isFinite(cap) || cap < 1 || cap > 100) {
    return json({ ok: false, error: "INVALID_CAP" }, 400);
  }

  try {
    await prisma.store_settings.update({
      where: { id: 1 },
      data: {
        intl_packaging_tare_pct: tare,
        intl_buffer_pct: buffer,
        intl_max_shipping_weight_kg: cap,
        updated_at: new Date(),
        updated_by: user!.id,
      },
    });
  } catch (upErr: any) {
    return json({ ok: false, error: upErr?.message ?? "Update failed" }, 500);
  }
  return json({
    ok: true,
    settings: {
      intl_packaging_tare_pct: tare,
      intl_buffer_pct: buffer,
      intl_max_shipping_weight_kg: cap,
    },
  });
}

export async function DELETE(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const url = new URL(req.url);
  const country = String(url.searchParams.get("country") || "").toUpperCase();
  if (!isSupportedCountry(country) || country === "IN") {
    return json({ ok: false, error: "INVALID_COUNTRY" }, 400);
  }

  try {
    await prisma.country_shipping_rates.deleteMany({ where: { country } });
  } catch (delErr: any) {
    return json({ ok: false, error: delErr?.message ?? "Delete failed" }, 500);
  }
  return json({ ok: true });
}
