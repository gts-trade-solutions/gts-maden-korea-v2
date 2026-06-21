// app/api/social/schedule/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// Optional: Node runtime
export const runtime = "nodejs";

/**
 * POST /api/social/schedule
 * body: {
 *   platform: 'facebook' | 'instagram',
 *   message?: string,
 *   media_url: string,
 *   media_type?: 'IMAGE' | 'VIDEO',
 *   scheduled_at: string (ISO or 'YYYY-MM-DDTHH:mm')
 * }
 */
export async function POST(req) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const platformRaw = (body.platform || "").toString().toLowerCase();
    const message = (body.message || "").toString();
    const mediaUrl = (body.media_url || "").toString();
    const mediaType = ((body.media_type || "").toString().toUpperCase() ||
      null)
    const scheduledAtRaw = (body.scheduled_at || "").toString();

    if (!["facebook", "instagram"].includes(platformRaw)) {
      return NextResponse.json(
        { error: "platform must be 'facebook' or 'instagram'" },
        { status: 400 }
      );
    }

    if (!mediaUrl) {
      return NextResponse.json(
        { error: "media_url is required" },
        { status: 400 }
      );
    }

    if (!scheduledAtRaw) {
      return NextResponse.json(
        { error: "scheduled_at is required" },
        { status: 400 }
      );
    }

    const scheduledAt = new Date(scheduledAtRaw);
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json(
        { error: "scheduled_at must be a valid date/time" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("social_schedules")
      .insert({
        owner_id: user.id,
        platform: platformRaw,
        message,
        media_url: mediaUrl,
        media_type: mediaType,
        scheduled_at: scheduledAt.toISOString(),
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      console.error("POST /api/social/schedule insert error:", error);
      return NextResponse.json(
        { error: "Failed to create schedule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ schedule: data }, { status: 200 });
  } catch (err) {
    console.error("POST /api/social/schedule error:", err);
    return NextResponse.json(
      { error: "Failed to create schedule", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/social/schedule
 * Optional query:
 *   ?status=pending
 *   ?limit=20
 * Returns the current user's schedules (for showing in UI).
 */
export async function GET(req) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // pending | sent | failed | null
    const limit = Number(searchParams.get("limit") || "25");

    let query = supabase
      .from("social_schedules")
      .select("*")
      .eq("owner_id", user.id)
      .order("scheduled_at", { ascending: true })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/social/schedule error:", error);
      return NextResponse.json(
        { error: "Failed to load schedules" },
        { status: 500 }
      );
    }

    return NextResponse.json({ schedules: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error("GET /api/social/schedule error:", err);
    return NextResponse.json(
      { error: "Failed to load schedules", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
