// app/api/instagram/posts/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

export async function GET(req: Request) {
  const { user } = await getRouteAuth();

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

  try {
    // Ownership: only return posts of a campaign the caller owns (previously
    // enforced implicitly by RLS).
    const data = await prisma.campaign_posts.findMany({
      where: { campaign_id: campaignId, campaigns: { owner_id: user.id } },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json({ posts: jsonSafe(data) });
  } catch (error) {
    console.error("GET /api/instagram/posts error:", error);
    return NextResponse.json(
      { error: "Failed to load posts" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const { user } = await getRouteAuth();

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

  // Get the campaign to grab instagram_account_id and validate ownership
  // (explicit now that RLS is gone).
  const campaign = await prisma.campaigns
    .findFirst({
      where: { id: campaign_id, owner_id: user.id },
      select: { id: true, instagram_account_id: true },
    })
    .catch((e) => {
      console.error("Campaign load error:", e);
      return null;
    });

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found or not accessible" },
      { status: 404 }
    );
  }

  try {
    const post = await prisma.campaign_posts.create({
      data: {
        id: randomUUID(),
        campaign_id,
        instagram_account_id: campaign.instagram_account_id,
        caption,
        media_type,
        media_url,
        status: "draft",
      },
    });
    return NextResponse.json({ post: jsonSafe(post) });
  } catch (error) {
    console.error("POST /api/instagram/posts error:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
