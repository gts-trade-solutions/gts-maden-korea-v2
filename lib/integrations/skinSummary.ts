import "server-only";
import OpenAI from "openai";
import { concernLabel, scoreRating } from "@/lib/integrations/skinConcerns";

// AI-generated, friendly one-paragraph summary of a skin analysis. Reuses the
// app's OpenAI setup (Responses API, gpt-4o-mini — same as /api/ai/social-copy).
// Returns null when no API key is set or generation fails (caller degrades).

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function generateSkinSummary(input: {
  overall: number | null;
  skinType: string | null;
  skinAge: string | null;
  concerns: { key: string; score: number }[];
  // Concerns that have product suggestions — mention each by name so they can be
  // highlighted + made clickable in the UI.
  treatmentKeys: string[];
}): Promise<string | null> {
  if (!client || input.concerns.length === 0) return null;

  const byScore = [...input.concerns].sort((a, b) => a.score - b.score);
  const treatmentLabels = input.treatmentKeys.map(concernLabel);
  // Fallback focus if nothing has products mapped yet.
  const focus = treatmentLabels.length
    ? treatmentLabels
    : byScore.slice(0, 2).map((c) => concernLabel(c.key));
  const strengths = [...byScore]
    .reverse()
    .slice(0, 2)
    .map((c) => concernLabel(c.key));

  const prompt = `You are a warm, encouraging skincare assistant. Write a short summary (2-4 sentences, ~55 words) of a user's AI skin analysis, speaking directly to them ("your skin"). Start with the overall score, then name EVERY focus area listed below by its EXACT name, and close on a strength. Keep it positive and non-clinical. No markdown, no bullet points, no medical claims, no product names.

Overall score: ${input.overall != null ? Math.round(input.overall * 100) + "/100" : "n/a"}
Skin type: ${input.skinType ?? "n/a"}
Estimated skin age: ${input.skinAge ?? "n/a"}
Focus areas to mention (use these EXACT words, every one of them): ${focus.join(", ") || "none"}
Strengths: ${strengths.join(", ") || "n/a"}`;

  try {
    const res: any = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });
    const text = (res?.output_text || "").trim();
    return text || null;
  } catch (e) {
    console.error("[skinSummary] generation failed:", e);
    return null;
  }
}

// Pull a JSON object out of a model response that may be wrapped in prose or
// ```json fences. Returns null if nothing parseable is found.
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// A short "why this product" blurb per concern's HERO product, in a single
// OpenAI call (returned as a JSON map keyed by concern key). Each blurb names
// the product and explains, warmly and non-clinically, why it suits that
// concern. Returns null on failure (caller degrades to no blurb).
export async function generateProductReasons(input: {
  items: {
    concernKey: string;
    concernLabel: string;
    score: number;
    productName: string;
    productBenefits: string; // short description / benefits, may be empty
  }[];
}): Promise<Record<string, string> | null> {
  if (!client || input.items.length === 0) return null;

  const rows = input.items.map((it) => {
    const pct = Math.round(it.score * 100);
    const b = it.productBenefits ? ` — ${it.productBenefits}` : "";
    return `${it.concernKey} | concern: ${it.concernLabel} (${pct}/100) | product: "${it.productName}"${b}`;
  });

  const prompt = `You are a warm, knowledgeable K-beauty skincare assistant. For EACH row below, write ONE short blurb (24-36 words) telling the user why the given product is a good match for that concern. You MUST mention the product by its exact name, speak directly to the user ("your ..."), and keep it encouraging and non-clinical. No markdown, no medical claims, no pricing.

Return ONLY a JSON object mapping each concern KEY (the first field, exactly) to its blurb. Keys: ${input.items.map((it) => it.concernKey).join(", ")}.

Rows (concernKey | concern | product):
${rows.join("\n")}`;

  try {
    const res: any = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });
    const parsed = extractJsonObject((res?.output_text || "").trim());
    if (!parsed) return null;
    const out: Record<string, string> = {};
    for (const it of input.items) {
      const v = parsed[it.concernKey];
      if (typeof v === "string" && v.trim()) out[it.concernKey] = v.trim();
    }
    return Object.keys(out).length ? out : null;
  } catch (e) {
    console.error("[skinSummary] product-reason generation failed:", e);
    return null;
  }
}

// One friendly sentence PER concern, in a single OpenAI call (returned as a
// JSON map keyed by concern key). Concerns in `eligibleKeys` (below threshold
// with mapped products) get guidance that nods to targeted products; the rest
// get a reassuring/advisory note. Returns null on any failure (caller degrades
// to no per-concern copy). Keep this cheap: one call, cached on the row.
export async function generatePerConcernSummaries(input: {
  concerns: { key: string; score: number }[];
  eligibleKeys: string[];
}): Promise<Record<string, string> | null> {
  if (!client || input.concerns.length === 0) return null;

  const eligible = new Set(input.eligibleKeys);
  const rows = input.concerns.map((c) => {
    const pct = Math.round(c.score * 100);
    const band = scoreRating(c.score).label;
    const tag = eligible.has(c.key) ? "TARGETED_PRODUCTS" : "NO_PRODUCTS";
    return `${c.key} | ${concernLabel(c.key)} | ${pct}/100 (${band}) | ${tag}`;
  });

  const prompt = `You are a warm, encouraging skincare assistant. For EACH concern below, write ONE short sentence (18-26 words), speaking directly to the user ("your ..."). Say what the score suggests and give gentle, non-clinical guidance. For rows tagged TARGETED_PRODUCTS, end by noting the right products can help — but NEVER name a product. For rows tagged NO_PRODUCTS, simply reassure or advise. No markdown, no medical claims.

Return ONLY a JSON object mapping each concern KEY (the first field, exactly) to its sentence. Use these keys: ${input.concerns.map((c) => c.key).join(", ")}.

Concerns (key | label | score | tag):
${rows.join("\n")}`;

  try {
    const res: any = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });
    const parsed = extractJsonObject((res?.output_text || "").trim());
    if (!parsed) return null;
    const out: Record<string, string> = {};
    for (const c of input.concerns) {
      const v = parsed[c.key];
      if (typeof v === "string" && v.trim()) out[c.key] = v.trim();
    }
    return Object.keys(out).length ? out : null;
  } catch (e) {
    console.error("[skinSummary] per-concern generation failed:", e);
    return null;
  }
}
