import "server-only";
import OpenAI from "openai";
import { concernLabel } from "@/lib/integrations/skinConcerns";

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
