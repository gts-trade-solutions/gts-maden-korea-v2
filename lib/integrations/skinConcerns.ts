// Presentation + config helpers for stored skin-analysis results. Pure — safe
// in server or client components. Mirrors the analyzer's concern-info model so
// the two apps read the same.

// Friendly name + plain-language description per concern.
export const CONCERN_INFO: Record<string, { name: string; description: string }> = {
  acne: { name: "Acne", description: "Breakouts and blemishes" },
  wrinkles: { name: "Wrinkles", description: "Fine lines and creases" },
  pores: { name: "Pores", description: "Visible or enlarged pores" },
  texture: { name: "Texture", description: "Smoothness and evenness" },
  redness: { name: "Redness", description: "Irritation or flushing" },
  oiliness: { name: "Oiliness", description: "Excess shine and oil" },
  moisture: { name: "Hydration", description: "Skin moisture level" },
  radiance: { name: "Radiance", description: "Glow and brightness" },
  firmness: { name: "Firmness", description: "Elasticity and bounce" },
  dark_circle: { name: "Dark circles", description: "Shadows under the eyes" },
  eye_bag: { name: "Eye bags", description: "Under-eye puffiness" },
  tear_trough: { name: "Tear troughs", description: "Hollowing under the eyes" },
  droopy_upper_eyelid: { name: "Upper eyelids", description: "Upper eyelid firmness" },
  droopy_lower_eyelid: { name: "Lower eyelids", description: "Lower eyelid firmness" },
  age_spot: { name: "Age spots", description: "Sun spots and pigmentation" },
};

// The full concern catalog the admin can configure (ordered).
export const CONCERN_KEYS = Object.keys(CONCERN_INFO);

/** Human label for a concern key (falls back to Title Case). */
export function concernLabel(key: string): string {
  if (CONCERN_INFO[key]) return CONCERN_INFO[key].name;
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function concernDescription(key: string): string | null {
  return CONCERN_INFO[key]?.description ?? null;
}

// ── Rating scale (3 levels, cutoffs at 50 / 75) ───────────────────────
// score is 0-1 health (higher = better). Bands: <50 Needs care, 50-75 Fair,
// ≥75 Good. Keep in sync with the analyzer's scoreRating.

export type Rating = {
  label: string;
  textClass: string; // text color
  barClass: string; // marker / solid fill color
  chipClass: string; // small chip bg+text
};

export function scoreRating(score01: number): Rating {
  const pct = score01 * 100;
  if (pct >= 75)
    return {
      label: "Good",
      textClass: "text-emerald-600",
      barClass: "bg-emerald-500",
      chipClass: "bg-emerald-100 text-emerald-800",
    };
  if (pct >= 50)
    return {
      label: "Fair",
      textClass: "text-amber-600",
      barClass: "bg-amber-500",
      chipClass: "bg-amber-100 text-amber-800",
    };
  return {
    label: "Needs care",
    textClass: "text-red-600",
    barClass: "bg-red-500",
    chipClass: "bg-red-100 text-red-800",
  };
}

// Score below which a concern recommends products, when the admin hasn't set
// a per-concern override.
export const DEFAULT_RECO_THRESHOLD = 0.6;

// Keys that are headline/meta, not per-concern rows.
export const META_KEYS = new Set(["overall", "skin_type", "skin_age", "resize_image"]);

export type SkinSummary = {
  overall?: number | null;
  skin_type?: string | null;
  skin_age?: string | null;
  top_concerns?: string[];
  base_image?: string | null; // durable proxy URL to the analyzed photo
  ai_summary?: string | null; // cached AI-generated paragraph (lazily filled)
};

// Per-issue details JSON stored from the analyzer callback.
export type SkinIssueDetails = {
  type?: string;
  imageUrl?: string | null; // durable proxy URL to this concern's overlay image
};
