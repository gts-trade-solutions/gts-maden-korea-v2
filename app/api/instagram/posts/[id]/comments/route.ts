// app/api/instagram/posts/[id]/comments/route.ts
import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user, sb } = await getRouteAuth();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const postId = params.id;

  // Optional: verify ownership by checking the campaign
  const { data: post, error: postErr } = await sb
    .from("campaign_posts")
    .select("id, campaign_id")
    .eq("id", postId)
    .maybeSingle();

  if (postErr || !post) {
    console.error("Post load error:", postErr);
    return NextResponse.json(
      { error: "Post not found or not accessible" },
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
      { error: "Not allowed to view comments for this post" },
      { status: 403 }
    );
  }

  const { data: comments, error } = await sb
    .from("instagram_comments")
    .select("*")
    .eq("campaign_post_id", postId)
    .order("commented_at", { ascending: true });

  if (error) {
    console.error("Load comments error:", error);
    return NextResponse.json(
      { error: "Failed to load comments" },
      { status: 500 }
    );
  }

  return NextResponse.json({ comments: comments || [] });
}
