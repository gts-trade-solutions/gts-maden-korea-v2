// app/api/instagram/comments/[id]/reply/route.ts
import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

const IG_GRAPH_BASE = "https://graph.facebook.com/v19.0";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user, sb } = await getRouteAuth();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const commentDbId = Number(params.id);
  if (Number.isNaN(commentDbId)) {
    return NextResponse.json(
      { error: "Invalid comment id" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { text } = body;

  if (!text) {
    return NextResponse.json(
      { error: "Reply text is required" },
      { status: 400 }
    );
  }

  // 1) Load original comment
  const { data: comment, error: commentErr } = await sb
    .from("instagram_comments")
    .select("id, instagram_comment_id, instagram_media_id, campaign_post_id")
    .eq("id", commentDbId)
    .maybeSingle();

  if (commentErr || !comment) {
    console.error("Comment load error:", commentErr);
    return NextResponse.json(
      { error: "Comment not found" },
      { status: 404 }
    );
  }

  // 2) Load post & campaign to check ownership
  const { data: post, error: postErr } = await sb
    .from("campaign_posts")
    .select("id, campaign_id, instagram_account_id")
    .eq("id", comment.campaign_post_id)
    .maybeSingle();

  if (postErr || !post) {
    console.error("Post load error:", postErr);
    return NextResponse.json(
      { error: "Post not found for this comment" },
      { status: 404 }
    );
  }

  const { data: campaign, error: campErr } = await sb
    .from("campaigns")
    .select("id, owner_id")
    .eq("id", post.campaign_id)
    .maybeSingle();

  if (campErr || !campaign || campaign.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Not allowed to reply to this comment" },
      { status: 403 }
    );
  }

  // 3) Load IG account
  const { data: igAccount, error: igErr } = await sb
    .from("instagram_accounts")
    .select("id, ig_business_account_id, access_token, username")
    .eq("id", post.instagram_account_id)
    .maybeSingle();

  if (igErr || !igAccount) {
    console.error("IG account load error:", igErr);
    return NextResponse.json(
      { error: "Instagram account not configured" },
      { status: 400 }
    );
  }

  if (!igAccount.access_token) {
    return NextResponse.json(
      { error: "Instagram access token missing" },
      { status: 400 }
    );
  }

  const accessToken = igAccount.access_token as string;
  const igCommentId = comment.instagram_comment_id as string;

  try {
    // 4) Call Graph API: reply to the comment
    const replyRes = await fetch(
      `${IG_GRAPH_BASE}/${igCommentId}/replies`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          message: text,
          access_token: accessToken,
        }),
      }
    );

    const replyJson = await replyRes.json();

    if (!replyRes.ok || !replyJson.id) {
      console.error("IG reply error:", replyJson);
      throw new Error(
        replyJson.error?.message || "Failed to reply on Instagram"
      );
    }

    const newIgCommentId = replyJson.id as string;

    // 5) Insert outbound comment row
    const { data: inserted, error: insertErr } = await sb
      .from("instagram_comments")
      .insert({
        instagram_comment_id: newIgCommentId,
        instagram_media_id: comment.instagram_media_id,
        campaign_post_id: comment.campaign_post_id,
        parent_comment_id: comment.id,
        from_ig_user_id: igAccount.ig_business_account_id,
        from_username: igAccount.username || null,
        text,
        like_count: 0,
        hidden: false,
        direction: "outbound",
        replied_by_user_id: user.id,
        commented_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertErr) {
      console.error("Insert reply comment error:", insertErr);
      throw new Error("Replied on IG but failed to save reply in DB");
    }

    return NextResponse.json({ reply: inserted });
  } catch (err: any) {
    console.error("Reply error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to reply to comment" },
      { status: 500 }
    );
  }
}
