// app/api/instagram/posts/[id]/comments/route.ts
import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user } = await getRouteAuth();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const postId = params.id;

  // Load the post + its campaign owner in one go, so ownership is enforced
  // explicitly (RLS used to do this implicitly).
  const post = await prisma.campaign_posts
    .findUnique({
      where: { id: postId },
      select: {
        id: true,
        instagram_media_id: true,
        campaigns: { select: { owner_id: true } },
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

  if (post.campaigns?.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Not allowed to view comments for this post" },
      { status: 403 }
    );
  }

  // `instagram_comments` has no campaign_post_id column (in either the old
  // Postgres schema or MySQL) — comments are keyed by the IG media id, so a
  // post's comments are the ones on the media it published. An unpublished
  // post (no instagram_media_id) simply has none yet.
  if (!post.instagram_media_id) {
    return NextResponse.json({ comments: [] });
  }

  try {
    const comments = await prisma.instagram_comments.findMany({
      where: { owner_id: user.id, ig_media_id: post.instagram_media_id },
      orderBy: { created_time: "asc" },
    });
    return NextResponse.json({ comments: jsonSafe(comments) });
  } catch (error) {
    console.error("Load comments error:", error);
    return NextResponse.json(
      { error: "Failed to load comments" },
      { status: 500 }
    );
  }
}
