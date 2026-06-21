// Unified delivery-estimate lookup for cart + checkout.
//
// India: combine shipping_zones (ETA per logistics zone) with the
// resolveIndianZone() PIN → zone mapping. With no PIN we return the
// broadest range across all zones so the cart can still show
// "Delivers in X-Y days".
//
// International: read the active country_shipping_rates row, return
// the eta_days_min/max columns. Returns null if the country has no
// active rate or no ETA configured — the cart will simply not render
// the ETA line.
//
// All values are cached in-process for 60s to keep cart re-renders
// snappy. The admin write endpoints don't bust this cache; ETA is a
// display-only number where 60s of staleness is acceptable.

import { createClient } from "@supabase/supabase-js";
import { resolveIndianZone } from "@/lib/shipping/indianZones";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const CACHE_TTL_MS = 60 * 1000;

export type DeliveryEstimate = {
  min: number;
  max: number;
  /** Human-friendly label for the source — useful for debug + display. */
  source: "zone" | "country" | "india_broad";
  /** When source = 'zone', the matched zone key. */
  zoneKey?: string;
};

function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── India: cached zones + broad fallback ──────────────────────────

type ZoneRow = {
  zone: string;
  eta_days_min: number;
  eta_days_max: number;
};

let cachedZones: { value: ZoneRow[]; expiresAt: number } | null = null;

async function getIndianZones(): Promise<ZoneRow[]> {
  const now = Date.now();
  if (cachedZones && cachedZones.expiresAt > now) return cachedZones.value;
  try {
    const sb = client();
    const { data, error } = await sb
      .from("shipping_zones")
      .select("zone, eta_days_min, eta_days_max");
    if (error || !data) {
      cachedZones = { value: [], expiresAt: now + CACHE_TTL_MS };
      return [];
    }
    const value = data as ZoneRow[];
    cachedZones = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cachedZones = { value: [], expiresAt: now + CACHE_TTL_MS };
    return [];
  }
}

// ─── Country: cached per-code map ──────────────────────────────────

type CountryEtaRow = {
  country: string;
  eta_days_min: number | null;
  eta_days_max: number | null;
};

let cachedCountries: { value: CountryEtaRow[]; expiresAt: number } | null =
  null;

async function getCountryEtas(): Promise<CountryEtaRow[]> {
  const now = Date.now();
  if (cachedCountries && cachedCountries.expiresAt > now)
    return cachedCountries.value;
  try {
    const sb = client();
    const { data, error } = await sb
      .from("country_shipping_rates")
      .select("country, eta_days_min, eta_days_max")
      .eq("active", true);
    if (error || !data) {
      cachedCountries = { value: [], expiresAt: now + CACHE_TTL_MS };
      return [];
    }
    const value = data as CountryEtaRow[];
    cachedCountries = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cachedCountries = { value: [], expiresAt: now + CACHE_TTL_MS };
    return [];
  }
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Get a delivery estimate for a destination.
 *
 * - `country`: ISO-3166-1 alpha-2 (e.g. "IN", "US"). Defaults to "IN".
 * - `pincode`: optional. For India, narrows the estimate to a single
 *   zone. Ignored for non-India destinations.
 *
 * Returns `null` if no estimate can be derived (e.g. the country has
 * no active rate or no ETA configured).
 */
export async function getDeliveryEstimate(
  country: string,
  pincode?: string | null
): Promise<DeliveryEstimate | null> {
  const code = (country || "IN").toUpperCase();

  if (code === "IN") {
    const zones = await getIndianZones();
    if (zones.length === 0) return null;

    if (pincode) {
      const zoneKey = resolveIndianZone(pincode);
      if (zoneKey) {
        const z = zones.find((r) => r.zone === zoneKey);
        if (z) {
          return {
            min: z.eta_days_min,
            max: z.eta_days_max,
            source: "zone",
            zoneKey,
          };
        }
      }
    }

    // No (or unresolvable) pincode → show the broadest India range so
    // we never over-promise. min = lowest min across zones, max =
    // highest max.
    const min = Math.min(...zones.map((z) => z.eta_days_min));
    const max = Math.max(...zones.map((z) => z.eta_days_max));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max, source: "india_broad" };
  }

  // International
  const rows = await getCountryEtas();
  const row = rows.find((r) => r.country === code);
  if (!row || row.eta_days_min == null || row.eta_days_max == null) {
    return null;
  }
  return {
    min: Number(row.eta_days_min),
    max: Number(row.eta_days_max),
    source: "country",
  };
}

export function bustDeliveryEstimateCache() {
  cachedZones = null;
  cachedCountries = null;
}
