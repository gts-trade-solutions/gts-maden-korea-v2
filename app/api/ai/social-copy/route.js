// app/api/ai/social-copy/route.js
import { NextResponse } from "next/server";
import OpenAI from "openai";

// Use your existing env var
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const body = await req.json();

    const baseText =
      (body.caption || body.baseText || body.message || "").trim();
    const platform = (body.platform || "instagram").toLowerCase();
    const tone = (body.tone || "friendly, engaging").toLowerCase();
    const brandContext = (body.brandContext || "").trim();
    const hashtagsContext = (body.hashtagsContext || body.tagsContext || "")
      .toString()
      .trim();

    if (!baseText) {
      return NextResponse.json(
        { error: "base caption / text is required" },
        { status: 400 }
      );
    }

    const prompt = `
You are a social media content assistant for a small brand.

TASK:
- Take the user's base text and rewrite it as an optimized caption for ${platform}.
- Keep it natural, human, and in a ${tone} tone.
- Optionally adapt slightly to Indian / Asian audience if relevant.
- Keep length appropriate for ${platform} (not too long, not too short).

EXTRA BRAND CONTEXT (optional, use only if helpful):
${brandContext || "(none)"}

HASHTAG CONTEXT (optional: themes, keywords, products):
${hashtagsContext || "(none)"}

USER BASE TEXT:
"${baseText}"

OUTPUT FORMAT (VERY IMPORTANT):
Return text in the following exact structure:

CAPTION:
<final caption here – 1–3 short paragraphs, no extra commentary>

HASHTAGS:
#tag1 #tag2 #tag3 ... (one line, 8–20 tags max)
    `.trim();

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      // no response_format – this was causing your 400 error
    });

    const fullText = response.output_text || "";

    // --- Parse CAPTION / HASHTAGS blocks ---
    let caption = "";
    let hashtagsLine = "";

    const captionMatch = fullText.match(
      /CAPTION:\s*([\s\S]*?)\n\s*HASHTAGS:/i
    );
    if (captionMatch) {
      caption = captionMatch[1].trim();
    } else {
      // Fallback: if parsing fails, use whole text as caption
      caption = fullText.trim();
    }

    const hashtagsMatch = fullText.match(/HASHTAGS:\s*([\s\S]*)/i);
    if (hashtagsMatch) {
      hashtagsLine = hashtagsMatch[1].trim();
    }

    // Normalize hashtags into array
    let hashtags = [];
    if (hashtagsLine) {
      // split on spaces, keep only words starting with #
      hashtags = hashtagsLine
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.startsWith("#"));
    }

    const hashtagsText = hashtags.join(" ");

    // Return with multiple keys so old UI names keep working
    return NextResponse.json(
      {
        caption,
        optimizedCaption: caption,

        hashtags,
        suggestedHashtags: hashtags,

        hashtags_text: hashtagsText,
        tags_text: hashtagsText,

        raw: fullText, // optional: handy for debugging in Network tab
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/ai/social-copy error:", error);

    // Handle OpenAI-style errors if present
    const message =
      error?.error?.message ||
      error?.message ||
      "Failed to generate social copy";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}
