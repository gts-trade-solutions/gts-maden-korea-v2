import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const { brief, type = "post" } = await req.json();

    if (!brief || typeof brief !== "string") {
      return NextResponse.json(
        { error: "Please provide a brief string in the request body." },
        { status: 400 }
      );
    }

    const isTags = type === "tags";

    const instructions = isTags
      ? "You are a social media strategist. Generate 10–20 short Facebook/Instagram hashtags for a Korean skincare or lifestyle brand. Output ONLY the hashtags separated by spaces, no explanations."
      : "You are a social media copywriter for a Korean skincare / lifestyle brand. Write a single engaging Facebook post in 2–4 short sentences, friendly tone, with 1–3 emojis. Do NOT include hashtags.";

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      instructions,
      input: `Brief: ${brief}`,
      max_output_tokens: 300,
    });

    const text = response.output_text ?? ""; // JS SDK helper field :contentReference[oaicite:0]{index=0}

    return NextResponse.json(
      {
        text: text.trim(),
        type: isTags ? "tags" : "post",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("AI helper error", err);
    return NextResponse.json(
      {
        error: "Failed to generate AI suggestion",
        details: String(err),
      },
      { status: 500 }
    );
  }
}
