// app/api/instagram/posts/[id]/publish/route.ts
import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

const IG_GRAPH_BASE = "https://graph.facebook.com/v19.0";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user } = await getRouteAuth();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const postId = params.id;

  // 1) Load post + campaign + instagram account (including token)
  const post = await prisma.campaign_posts
    .findUnique({
      where: { id: postId },
      include: {
        campaigns: {
          select: { id: true, owner_id: true, instagram_account_id: true },
        },
        instagram_accounts: {
          select: {
            id: true,
            owner_id: true,
            ig_business_account_id: true,
            access_token: true,
          },
        },
      },
    })
    .catch((e) => {
      console.error("Post load error:", e);
      return null;
    });

  if (!post) {
    return NextResponse.json(
      { error: "Post not found or not accessible" },
      { status: 404 }
    );
  }

  // Safety: ensure this belongs to the logged-in user
  if (post.campaigns.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Not allowed to publish this post" },
      { status: 403 }
    );
  }

  const igAccount = post.instagram_accounts;

  if (!igAccount.access_token || !igAccount.ig_business_account_id) {
    return NextResponse.json(
      { error: "Instagram account not configured with token" },
      { status: 400 }
    );
  }

  const accessToken = igAccount.access_token as string;
  const igBusinessId = igAccount.ig_business_account_id as string;

  if (!post.media_url) {
    return NextResponse.json(
      { error: "Post has no media_url to publish" },
      { status: 400 }
    );
  }

  // 2) Mark as publishing
  await prisma.campaign_posts.update({
    where: { id: postId },
    data: { status: "publishing", error_message: null },
  });

  try {
    // 3) Create media container
    const creationRes = await fetch(`${IG_GRAPH_BASE}/${igBusinessId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: post.media_url,
        caption: post.caption || "",
        access_token: accessToken,
      }),
    });

    const creationJson = await creationRes.json();

    if (!creationRes.ok || !creationJson.id) {
      console.error("IG media creation error:", creationJson);
      throw new Error(
        creationJson.error?.message ||
          "Failed to create media container on Instagram"
      );
    }

    const creationId = creationJson.id as string;

    // 4) Publish media
    const publishRes = await fetch(
      `${IG_GRAPH_BASE}/${igBusinessId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          creation_id: creationId,
          access_token: accessToken,
        }),
      }
    );

    const publishJson = await publishRes.json();

    if (!publishRes.ok || !publishJson.id) {
      console.error("IG media publish error:", publishJson);
      throw new Error(
        publishJson.error?.message || "Failed to publish media on Instagram"
      );
    }

    const instagramMediaId = publishJson.id as string;

    // 5) Fetch permalink
    const detailsRes = await fetch(
      `${IG_GRAPH_BASE}/${instagramMediaId}?fields=id,permalink&access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    const detailsJson = await detailsRes.json();

    if (!detailsRes.ok) {
      console.error("IG media details error:", detailsJson);
    }

    const permalink = detailsJson.permalink || null;

    // 6) Update post in DB
    let updatedPost;
    try {
      updatedPost = await prisma.campaign_posts.update({
        where: { id: postId },
        data: {
          status: "published",
          instagram_media_id: instagramMediaId,
          permalink,
          published_at: new Date(),
          error_message: null,
        },
      });
    } catch (updateErr) {
      console.error("Post update error after publish:", updateErr);
      throw new Error("Published on IG but failed to update DB");
    }

    return NextResponse.json({ post: jsonSafe(updatedPost) });
  } catch (err: any) {
    console.error("Publish error:", err);

    // Set failed status + error
    await prisma.campaign_posts
      .update({
        where: { id: postId },
        data: {
          status: "failed",
          error_message: err.message || "Unknown error",
        },
      })
      .catch(() => {});

    return NextResponse.json(
      { error: err.message || "Failed to publish post" },
      { status: 500 }
    );
  }
}
