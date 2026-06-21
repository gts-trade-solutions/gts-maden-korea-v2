// app/api/instagram/account/route.ts
import { NextResponse } from "next/server";
import { getAdminSupabase, ADMIN_OWNER_ID } from "@/lib/adminSupabase";

export async function GET() {
  try {
    const supabase = getAdminSupabase();

    if (!ADMIN_OWNER_ID) {
      return NextResponse.json(
        {
          error:
            "ADMIN_OWNER_ID / FB_OWNER_ID env not set. Please set FB_OWNER_ID to a Supabase user UUID.",
        },
        { status: 400 }
      );
    }

    let query = supabase
      .from("instagram_accounts")
      .select(
        "id, owner_id, ig_business_account_id, username, profile_picture_url, token_expires_at, is_active"
      )
      .eq("is_active", true)
      .eq("owner_id", ADMIN_OWNER_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/instagram/account error:", error);
      return NextResponse.json(
        { error: "Failed to load instagram account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ account: data ?? null }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/instagram/account unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error loading instagram account" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();

    if (!ADMIN_OWNER_ID) {
      return NextResponse.json(
        {
          error:
            "ADMIN_OWNER_ID / FB_OWNER_ID env not set. Please set FB_OWNER_ID to a Supabase user UUID.",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      ig_business_account_id,
      username,
      access_token,
      token_expires_at, // optional
    } = body;

    if (!ig_business_account_id || !access_token) {
      return NextResponse.json(
        { error: "ig_business_account_id and access_token are required" },
        { status: 400 }
      );
    }

    const expiresAt = token_expires_at
      ? new Date(token_expires_at).toISOString()
      : null;

    const { data, error } = await supabase
      .from("instagram_accounts")
      .upsert(
        {
          owner_id: ADMIN_OWNER_ID,
          ig_business_account_id,
          username,
          access_token,
          token_expires_at: expiresAt,
          is_active: true,
        },
        {
          onConflict: "owner_id, ig_business_account_id",
        }
      )
      .select(
        "id, owner_id, ig_business_account_id, username, token_expires_at, is_active"
      )
      .single();

    if (error) {
      console.error("POST /api/instagram/account upsert error:", error);
      return NextResponse.json(
        { error: "Failed to save instagram account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ account: data }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/instagram/account unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error saving instagram account" },
      { status: 500 }
    );
  }
}
