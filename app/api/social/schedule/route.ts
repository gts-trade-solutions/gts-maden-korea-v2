// app/api/social/schedule/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { randomUUID } from "node:crypto";

// Use a fixed owner for scheduled jobs (same idea as IG routes)
const DEFAULT_OWNER_ID =
  process.env.IG_OWNER_ID ||
  process.env.FB_OWNER_ID ||
  process.env.INSTAGRAM_OWNER_ID ||
  "00000000-0000-0000-0000-000000000000";

export async function POST(req: Request) {
  try {
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

    const data = await prisma.social_scheduled_posts.create({
      data: {
        id: randomUUID(),
        owner_id: DEFAULT_OWNER_ID,
        platform, // 'instagram' | 'facebook'
        channel, // e.g. 'instagram', 'facebook_page'
        message: text || null,
        media_url: media_url || null,
        media_type: media_type || null,
        scheduled_at: scheduledDate,
        status: "pending",
        payload: {
          ...(payload || {}),
          platform,
          channel,
          caption: caption ?? null,
          message: message ?? null,
          media_url: media_url ?? null,
          media_type: media_type ?? null,
        },
      },
    });

    return NextResponse.json({ data: jsonSafe(data) }, { status: 200 });
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
