// app/api/instagram/posts/[id]/comments/sync/route.ts
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

  const postId = params.id;

  // 1) Load post
  const { data: post, error: postErr } = await sb
    .from("campaign_posts")
    .select("id, campaign_id, instagram_media_id, instagram_account_id")
    .eq("id", postId)
    .maybeSingle();

  if (postErr || !post) {
    console.error("Post load error:", postErr);
    return NextResponse.json(
      { error: "Post not found or not accessible" },
      { status: 404 }
    );
  }

  if (!post.instagram_media_id) {
    return NextResponse.json(
      { error: "Post is not published on Instagram yet" },
      { status: 400 }
    );
  }

  // 2) Check ownership via campaign
  const { data: campaign, error: campErr } = await sb
    .from("campaigns")
    .select("id, owner_id, instagram_account_id")
    .eq("id", post.campaign_id)
    .maybeSingle();

  if (campErr || !campaign) {
    console.error("Campaign load error:", campErr);
    return NextResponse.json(
      { error: "Campaign not found or not accessible" },
      { status: 404 }
    );
  }

  if (campaign.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Not allowed to sync comments for this post" },
      { status: 403 }
    );
  }

  // 3) Load Instagram account for token
  const { data: igAccount, error: igErr } = await sb
    .from("instagram_accounts")
    .select("id, ig_business_account_id, access_token")
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
  const mediaId = post.instagram_media_id as string;

  try {
    // 4) Call Instagram Graph API to get comments
    const url = new URL(`${IG_GRAPH_BASE}/${mediaId}/comments`);
    url.searchParams.set(
      "fields",
      "id,text,timestamp,username,like_count,user"
    );
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("limit", "50"); // basic first-page sync

    const res = await fetch(url.toString());
    const json = await res.json();

    if (!res.ok) {
      console.error("IG comments fetch error:", json);
      throw new Error(json.error?.message || "Failed to fetch comments");
    }

    const comments = (json.data || []) as any[];

    // 5) Upsert comments into DB
    const rows = comments.map((c) => {
      const userObj = c.user || {};
      return {
        instagram_comment_id: c.id,
        instagram_media_id: mediaId,
        campaign_post_id: post.id,
        parent_comment_id: null, // for now; nested replies could be handled later
        from_ig_user_id: userObj.id || null,
        from_username: c.username || userObj.username || null,
        text: c.text || "",
        like_count: c.like_count ?? 0,
        hidden: false,
        direction: "inbound" as const,
        commented_at: c.timestamp ? new Date(c.timestamp).toISOString() : new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      const { error: upsertErr } = await sb
        .from("instagram_comments")
        .upsert(rows as any, {
          onConflict: "instagram_comment_id",
        });

      if (upsertErr) {
        console.error("Comments upsert error:", upsertErr);
        throw new Error("Failed to save comments in DB");
      }
    }

    return NextResponse.json({
      synced_count: rows.length,
    });
  } catch (err: any) {
    console.error("Sync comments error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to sync comments" },
      { status: 500 }
    );
  }
}
