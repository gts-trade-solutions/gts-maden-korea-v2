// Presentation helpers for stored skin-analysis results (shared by the results
// pages). Pure — safe in server or client components.

const CONCERN_LABELS: Record<string, string> = {
  acne: "Acne",
  wrinkles: "Wrinkles",
  pores: "Pores",
  texture: "Texture",
  redness: "Redness",
  oiliness: "Oiliness",
  moisture: "Moisture",
  radiance: "Radiance",
  firmness: "Firmness",
  dark_circle: "Dark circles",
  eye_bag: "Eye bags",
  tear_trough: "Tear troughs",
  droopy_upper_eyelid: "Upper eyelids",
  droopy_lower_eyelid: "Lower eyelids",
  age_spot: "Age spots",
  overall: "Overall",
  skin_type: "Skin type",
  skin_age: "Skin age",
};

/** Human label for a concern key (falls back to Title Case of the key). */
export function concernLabel(key: string): string {
  if (CONCERN_LABELS[key]) return CONCERN_LABELS[key];
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type BandStyle = { label: string; className: string };

/** Tailwind chip styles per severity band. */
export function bandStyle(band: string | null | undefined): BandStyle {
  switch (band) {
    case "clear":
      return { label: "Clear", className: "bg-emerald-100 text-emerald-800" };
    case "mild":
      return { label: "Mild", className: "bg-lime-100 text-lime-800" };
    case "moderate":
      return { label: "Moderate", className: "bg-amber-100 text-amber-800" };
    case "severe":
      return { label: "Needs care", className: "bg-red-100 text-red-800" };
    default:
      return { label: "—", className: "bg-muted text-muted-foreground" };
  }
}

// Keys that are headline/meta, not per-concern rows.
export const META_KEYS = new Set(["overall", "skin_type", "skin_age"]);

export type SkinSummary = {
  overall?: number | null;
  skin_type?: string | null;
  skin_age?: string | null;
  top_concerns?: string[];
};
