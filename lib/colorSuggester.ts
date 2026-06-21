// Pure client-side image color analysis. No external API calls.
// Used by the Discover editor to suggest readable text colors based
// on the uploaded image and to score WCAG contrast for any chosen
// text/background combination.

export type ColorSuggestion = {
  hex: string;
  label: string;
  contrast: number;
  passesAA: boolean;
};

export type SuggestionMode =
  | "best-contrast"
  | "match-dominant"
  | "image-palette";

export type SuggestOptions = {
  /**
   * - `best-contrast`: rank a fixed brand-friendly preset palette by
   *   WCAG contrast against the image's dominant color (default).
   * - `match-dominant`: synthesize lightness variations of the
   *   dominant color so the text feels harmonious with the image.
   * - `image-palette`: return the top-N most-common colors actually
   *   present in the image, de-duplicated by perceptual closeness.
   *   AA filter is silently skipped — colors come from the image
   *   itself and won't pass contrast against it.
   */
  mode?: SuggestionMode;
  /** When true, drop suggestions that fail AA. Ignored in image-palette. */
  aaOnly?: boolean;
};

export type ImageColorAnalysis = {
  avgLuminance: number; // 0..1
  dominantHex: string;
  mode: SuggestionMode;
  suggestions: ColorSuggestion[];
};

const SAMPLE_SIZE = 48;

const PALETTE: { hex: string; label: string }[] = [
  { hex: "#ffffff", label: "White" },
  { hex: "#000000", label: "Black" },
  { hex: "#0f172a", label: "Slate 900" },
  { hex: "#f8fafc", label: "Slate 50" },
  { hex: "#dc2626", label: "Brand red" },
  { hex: "#0ea5e9", label: "Sky" },
  { hex: "#16a34a", label: "Emerald" },
  { hex: "#f59e0b", label: "Amber" },
  { hex: "#7c3aed", label: "Violet" },
  { hex: "#ec4899", label: "Pink" },
];

export const COLOR_PRESETS = PALETTE;

function clamp(n: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, n));
}

function toHex(n: number): string {
  return clamp(Math.round(n)).toString(16).padStart(2, "0");
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return [r, g, b];
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (Number.isNaN(r + g + b)) return null;
    return [r, g, b];
  }
  return null;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

/** WCAG contrast ratio between two colors (1..21). */
export function contrastRatio(hex1: string, hex2: string): number {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  if (!a || !b) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function passesAA(ratio: number, large = false): boolean {
  return ratio >= (large ? 3 : 4.5);
}

function rgbToHsl(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(
  h: number,
  s: number,
  l: number
): [number, number, number] {
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      let tn = t;
      if (tn < 0) tn += 1;
      if (tn > 1) tn -= 1;
      if (tn < 1 / 6) return p + (q - p) * 6 * tn;
      if (tn < 1 / 2) return q;
      if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function variationsAroundHex(hex: string): { hex: string; label: string }[] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [];
  const [h, s] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  // Five readable lightness levels around the source hue.
  const lights = [0.95, 0.75, 0.55, 0.3, 0.08];
  return lights.map((l) => {
    const [r, g, b] = hslToRgb(h, Math.min(s, 0.7), l);
    return {
      hex: rgbToHex(r, g, b),
      label:
        l > 0.85
          ? "Near-white tint"
          : l > 0.6
            ? "Light tint"
            : l > 0.45
              ? "Mid tone"
              : l > 0.2
                ? "Dark shade"
                : "Near-black shade",
    };
  });
}

/**
 * Loads the image, samples a small canvas, returns the average
 * luminance and a histogram-based dominant color, plus a ranked list
 * of readable text-color suggestions.
 */
export async function analyzeImageColor(
  url: string,
  options: SuggestOptions = {}
): Promise<ImageColorAnalysis> {
  const mode: SuggestionMode = options.mode ?? "best-contrast";
  const aaOnly = !!options.aaOnly;
  const fallback = (bg: string): ImageColorAnalysis => ({
    avgLuminance: 0.5,
    dominantHex: bg,
    mode,
    suggestions:
      mode === "image-palette"
        ? rankImagePalette([bg], bg)
        : rankAgainst(bg, mode, aaOnly),
  });

  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback("#888888");
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return fallback("#888888");
  }

  let lumSum = 0;
  let pixelCount = 0;
  // Coarse 4-bit-per-channel histogram for dominant color.
  const bins = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 200) continue;
    pixelCount += 1;
    lumSum += relativeLuminance([r, g, b]);
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const slot = bins.get(key);
    if (slot) {
      slot.r += r;
      slot.g += g;
      slot.b += b;
      slot.n += 1;
    } else {
      bins.set(key, { r, g, b, n: 1 });
    }
  }
  const avgLuminance = pixelCount > 0 ? lumSum / pixelCount : 0.5;

  // Sort all bins by count desc, then derive (a) the dominant hex and
  // (b) a de-duplicated list of palette swatches actually present in
  // the image, useful for the 'image-palette' suggestion mode.
  const sortedBins = Array.from(bins.values())
    .map((slot) => ({
      hex: rgbToHex(slot.r / slot.n, slot.g / slot.n, slot.b / slot.n),
      count: slot.n,
    }))
    .sort((a, b) => b.count - a.count);

  const topHex = sortedBins[0]?.hex ?? "#888888";
  const palette = dedupeNearbyHexes(
    sortedBins.map((b) => b.hex),
    12
  ).slice(0, 5);

  return {
    avgLuminance,
    dominantHex: topHex,
    mode,
    suggestions:
      mode === "image-palette"
        ? rankImagePalette(palette, topHex)
        : rankAgainst(topHex, mode, aaOnly),
  };
}

/**
 * Drop hexes that are within `minDistance` (Euclidean RGB) of an
 * already-kept hex. Preserves order — the higher-count hex wins.
 */
function dedupeNearbyHexes(hexes: string[], minDistance: number): string[] {
  const kept: Array<[number, number, number, string]> = [];
  for (const hex of hexes) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue;
    const tooClose = kept.some(([r, g, b]) => {
      const dr = r - rgb[0];
      const dg = g - rgb[1];
      const db = b - rgb[2];
      return Math.sqrt(dr * dr + dg * dg + db * db) < minDistance;
    });
    if (!tooClose) kept.push([rgb[0], rgb[1], rgb[2], hex]);
  }
  return kept.map((k) => k[3]);
}

function rankImagePalette(
  palette: string[],
  dominantHex: string
): ColorSuggestion[] {
  return palette.map((hex, i) => {
    // Contrast vs. the dominant color is informational only — the
    // user is intentionally picking from the image itself.
    const c = contrastRatio(hex, dominantHex);
    return {
      hex,
      label: i === 0 ? "Dominant" : `Image color ${i + 1}`,
      contrast: c,
      passesAA: passesAA(c),
    };
  });
}

function rankAgainst(
  bgHex: string,
  mode: SuggestionMode,
  aaOnly: boolean
): ColorSuggestion[] {
  const pool =
    mode === "match-dominant" ? variationsAroundHex(bgHex) : PALETTE;
  const ranked = pool.map((p) => {
    const c = contrastRatio(p.hex, bgHex);
    return { hex: p.hex, label: p.label, contrast: c, passesAA: passesAA(c) };
  });
  ranked.sort((a, b) => b.contrast - a.contrast);
  const filtered = aaOnly ? ranked.filter((r) => r.passesAA) : ranked;
  // If aaOnly filtered everything out, fall back to the top 3 unfiltered
  // so the user sees something rather than an empty list.
  return (filtered.length > 0 ? filtered : ranked).slice(0, 5);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    // Try CORS — if the storage bucket sets the right header we get
    // pixel access; otherwise the canvas will be tainted and we fall
    // back gracefully.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = url;
  });
}
