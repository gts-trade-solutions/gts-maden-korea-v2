// app/api/social/schedule/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Re-use the same admin pattern as other social routes
function getAdminSupabase() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Supabase URL or SERVICE_ROLE key missing in environment variables"
    );
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    }
  );
}

// Use a fixed owner for scheduled jobs (same idea as IG routes)
const DEFAULT_OWNER_ID =
  process.env.IG_OWNER_ID ||
  process.env.FB_OWNER_ID ||
  process.env.INSTAGRAM_OWNER_ID ||
  "00000000-0000-0000-0000-000000000000";


  
export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const body = await req.json();

    let {
      platform,
      channel,
      caption,
      message,
      media_url,
      media_type,
      scheduled_at,
      payload,
    } = body;

    if (!scheduled_at) {
      return NextResponse.json(
        { error: "scheduled_at is required" },
        { status: 400 }
      );
    }

    // Normalise platform / channel
    platform = (platform || "").toLowerCase();
    channel = channel || null;

    // Infer platform from channel if not provided
    if (!platform) {
      if (channel && channel.toLowerCase().includes("instagram")) {
        platform = "instagram";
      } else if (channel && channel.toLowerCase().includes("facebook")) {
        platform = "facebook";
      }
    }

    // ✨ NOW: support BOTH instagram and facebook
    if (platform !== "instagram" && platform !== "facebook") {
      return NextResponse.json(
        {
          error:
            "Unsupported platform. Only 'instagram' and 'facebook' scheduling are supported.",
        },
        { status: 400 }
      );
    }

    // Normalise text into message column
    const text =
      (caption ?? "").toString().trim() ||
      (message ?? "").toString().trim() ||
      "";

    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { error: "scheduled_at is not a valid date" },
        { status: 400 }
      );
    }

    const row = {
      owner_id: DEFAULT_OWNER_ID,
      platform, // 'instagram' | 'facebook'
      channel,  // e.g. 'instagram', 'facebook_page'
      message: text || null,
      media_url: media_url || null,
      media_type: media_type || null,
      scheduled_at: scheduledDate.toISOString(),
      status: "pending" as const,
      payload: {
        ...(payload || {}),
        platform,
        channel,
        caption: caption ?? null,
        message: message ?? null,
        media_url: media_url ?? null,
        media_type: media_type ?? null,
      },
    };

    const { data, error } = await supabase
      .from("social_scheduled_posts")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      console.error("Error inserting into social_scheduled_posts:", error);
      return NextResponse.json(
        {
          error: "Failed to schedule post",
          details: error.message || String(error),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/social/schedule error", err);
    return NextResponse.json(
      {
        error: "Failed to schedule post",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
