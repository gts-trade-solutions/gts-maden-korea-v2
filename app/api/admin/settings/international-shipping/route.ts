export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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


function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

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

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = admin();

  const [ratesRes, settingsRes] = await Promise.all([
    sb
      .from("country_shipping_rates")
      .select(
        `country, active, notes, eta_days_min, eta_days_max, updated_at,
         ${SLAB_COLS.join(", ")}`
      )
      .order("country", { ascending: true }),
    sb
      .from("store_settings")
      .select(
        "intl_packaging_tare_pct, intl_buffer_pct, intl_max_shipping_weight_kg"
      )
      .eq("id", 1)
      .maybeSingle(),
  ]);
  if (ratesRes.error) return json({ ok: false, error: ratesRes.error.message }, 500);
  if (settingsRes.error)
    return json({ ok: false, error: settingsRes.error.message }, 500);

  return json({
    ok: true,
    rates: ratesRes.data ?? [],
    settings: {
      intl_packaging_tare_pct:
        Number((settingsRes.data as any)?.intl_packaging_tare_pct ?? 15),
      intl_buffer_pct: Number((settingsRes.data as any)?.intl_buffer_pct ?? 20),
      intl_max_shipping_weight_kg: Number(
        (settingsRes.data as any)?.intl_max_shipping_weight_kg ?? 20
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
  const slabPayload: Record<string, number> = {};
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

  const sb = admin();
  const { error: upErr } = await sb
    .from("country_shipping_rates")
    .upsert(
      {
        country,
        ...slabPayload,
        active,
        notes,
        eta_days_min: etaMin,
        eta_days_max: etaMax,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "country" }
    );

  if (upErr) return json({ ok: false, error: upErr.message }, 500);
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

  const sb = admin();
  const { error: upErr } = await sb
    .from("store_settings")
    .update({
      intl_packaging_tare_pct: tare,
      intl_buffer_pct: buffer,
      intl_max_shipping_weight_kg: cap,
      updated_at: new Date().toISOString(),
      updated_by: user!.id,
    })
    .eq("id", 1);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);
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

  const sb = admin();
  const { error: delErr } = await sb
    .from("country_shipping_rates")
    .delete()
    .eq("country", country);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);
  return json({ ok: true });
}
