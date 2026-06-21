// app/api/instagram/posts/route.ts
import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

export async function GET(req: Request) {
  const { user, sb } = await getRouteAuth();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaign_id");

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaign_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await sb
    .from("campaign_posts")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GET /api/instagram/posts error:", error);
    return NextResponse.json(
      { error: "Failed to load posts" },
      { status: 500 }
    );
  }

  return NextResponse.json({ posts: data });
}

export async function POST(req: Request) {
  const { user, sb } = await getRouteAuth();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { campaign_id, caption, media_url, media_type = "image" } = body;

  if (!campaign_id || !media_url) {
    return NextResponse.json(
      { error: "campaign_id and media_url are required" },
      { status: 400 }
    );
  }

  // Get the campaign to also grab instagram_account_id and validate ownership via RLS implicitly
  const { data: campaign, error: campErr } = await sb
    .from("campaigns")
    .select("id, instagram_account_id")
    .eq("id", campaign_id)
    .maybeSingle();

  if (campErr || !campaign) {
    console.error("Campaign load error:", campErr);
    return NextResponse.json(
      { error: "Campaign not found or not accessible" },
      { status: 404 }
    );
  }

  const { data: post, error } = await sb
    .from("campaign_posts")
    .insert({
      campaign_id,
      instagram_account_id: campaign.instagram_account_id,
      caption,
      media_type,
      media_url,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) {
    console.error("POST /api/instagram/posts error:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }

  return NextResponse.json({ post });
}
