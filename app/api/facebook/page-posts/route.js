// app/api/facebook/page-posts/route.js
import { NextResponse } from "next/server";
import { getAdminSupabase, ADMIN_OWNER_ID } from "@/lib/adminSupabase";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// 🔹 GET = fetch latest posts, cache, return
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

    // 1️⃣ Get page + token for admin owner
    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("id, facebook_page_id, page_access_token, created_at")
      .eq("owner_id", ADMIN_OWNER_ID)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accError) {
      console.error("instagram_accounts error:", accError);
      return NextResponse.json(
        { error: "Failed to load instagram/facebook config" },
        { status: 400 }
      );
    }

    if (!account) {
      return NextResponse.json(
        { error: "No active instagram/facebook config found" },
        { status: 400 }
      );
    }

    if (!account.facebook_page_id) {
      return NextResponse.json(
        { error: "No Facebook Page ID found – sync from Facebook first." },
        { status: 400 }
      );
    }

    if (!account.page_access_token) {
      return NextResponse.json(
        {
          error:
            "No page access token stored – re-sync from Facebook to save it.",
        },
        { status: 400 }
      );
    }

    const pageId = account.facebook_page_id;
    const pageToken = account.page_access_token;

    // 2️⃣ Fetch posts (+ reactions/comments summary)
    const postsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        pageId
      )}/posts?fields=id,message,created_time,permalink_url,attachments{media_type,media,url},reactions.summary(true).limit(0),comments.summary(true).limit(0)&limit=20&access_token=${encodeURIComponent(
        pageToken
      )}`
    );

    const postsText = await postsRes.text();
    let postsJson = null;
    try {
      postsJson = JSON.parse(postsText);
    } catch {}

    if (!postsRes.ok) {
      const fbError = postsJson?.error || postsText;
      console.error(`Error fetching /${pageId}/posts:`, fbError);
      return NextResponse.json(
        {
          error: "Failed to fetch Facebook Page posts",
          fbError,
        },
        { status: 400 }
      );
    }

    const posts = postsJson?.data || [];

    // 3️⃣ Optional: try insights in separate call (safe metrics)
    let postsWithInsights = posts;
    if (posts.length > 0) {
      try {
        const ids = posts.map((p) => p.id).join(",");
        const insightsRes = await fetch(
          `${GRAPH_BASE}?ids=${encodeURIComponent(
            ids
          )}&fields=insights.metric(post_impressions,post_engaged_users)&access_token=${encodeURIComponent(
            pageToken
          )}`
        );

        const insightsText = await insightsRes.text();
        let insightsJson = null;
        try {
          insightsJson = JSON.parse(insightsText);
        } catch {}

        if (!insightsRes.ok) {
          const fbError = insightsJson?.error || insightsText;
          console.warn(
            "Insights fetch failed; continuing without stats:",
            fbError
          );
          postsWithInsights = posts;
        } else if (insightsJson && typeof insightsJson === "object") {
          postsWithInsights = posts.map((p) => ({
            ...p,
            insights: insightsJson[p.id]?.insights || null,
          }));
        }
      } catch (insightsErr) {
        console.warn(
          "Error while fetching insights; continuing without stats:",
          insightsErr
        );
        postsWithInsights = posts;
      }
    }

    // 4️⃣ Upsert into DB
    if (postsWithInsights.length > 0) {
      const records = postsWithInsights.map((p) => ({
        owner_id: ADMIN_OWNER_ID,
        facebook_page_id: pageId,
        fb_post_id: p.id,
        message: p.message || null,
        permalink_url: p.permalink_url || null,
        created_time: p.created_time
          ? new Date(p.created_time).toISOString()
          : null,
        attachments: p.attachments || null,
        insights: p.insights || null,
        reactions_count: p.reactions?.summary?.total_count ?? null,
        comments_count: p.comments?.summary?.total_count ?? null,
      }));

      const { error: upsertError } = await supabase
        .from("facebook_page_posts")
        .upsert(records, {
          onConflict: "owner_id,fb_post_id",
        });

      if (upsertError) {
        console.error("Upsert error facebook_page_posts:", upsertError);
      }
    }

    // 5️⃣ Read from DB
    const { data: cachedPosts, error: cachedError } = await supabase
      .from("facebook_page_posts")
      .select(
        "id, fb_post_id, message, permalink_url, created_time, attachments, insights, reactions_count, comments_count"
      )
      .eq("owner_id", ADMIN_OWNER_ID)
      .eq("facebook_page_id", pageId)
      .order("created_time", { ascending: false })
      .limit(20);

    if (cachedError) throw cachedError;

    return NextResponse.json({ data: cachedPosts }, { status: 200 });
  } catch (err) {
    console.error("GET /api/facebook/page-posts error", err);
    return NextResponse.json(
      { error: "Failed to load page posts", details: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req) {
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
    const message = (body.message || "").trim();
    const mediaUrl = (body.media_url || "").trim();

    if (!message && !mediaUrl) {
      return NextResponse.json(
        { error: "Provide at least a message or media_url" },
        { status: 400 }
      );
    }

    // 1️⃣ Get page + page_access_token
    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("facebook_page_id, page_access_token")
      .eq("owner_id", ADMIN_OWNER_ID)
      .eq("is_active", true)
      .single();

    if (accError) {
      console.error("No instagram_accounts row", accError);
      return NextResponse.json(
        { error: "No active instagram/facebook config found" },
        { status: 400 }
      );
    }

    if (!account.facebook_page_id) {
      return NextResponse.json(
        { error: "No Facebook Page ID found – sync from Facebook first." },
        { status: 400 }
      );
    }

    if (!account.page_access_token) {
      return NextResponse.json(
        { error: "No page access token stored – sync from Facebook again." },
        { status: 400 }
      );
    }

    const pageId = account.facebook_page_id;
    const pageToken = account.page_access_token;

    let newPostId = null;

    // 2️⃣ Create the post in Facebook
    if (mediaUrl) {
      // Photo post
      const url = new URL(
        `${GRAPH_BASE}/${encodeURIComponent(pageId)}/photos`
      );
      const params = new URLSearchParams({
        url: mediaUrl,
        access_token: pageToken,
      });
      if (message) params.set("caption", message);

      const fbRes = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const fbText = await fbRes.text();
      let fbJson = null;
      try {
        fbJson = JSON.parse(fbText);
      } catch {}

      if (!fbRes.ok) {
        const fbError = fbJson?.error || fbText;
        console.error(`Error posting photo to /${pageId}/photos:`, fbError);
        return NextResponse.json(
          { error: "Failed to create Facebook photo post", fbError },
          { status: 400 }
        );
      }

      newPostId = fbJson.id;
    } else {
      // Text-only post
      const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(pageId)}/feed`);
      const params = new URLSearchParams({
        message,
        access_token: pageToken,
      });

      const fbRes = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const fbText = await fbRes.text();
      let fbJson = null;
      try {
        fbJson = JSON.parse(fbText);
      } catch {}

      if (!fbRes.ok) {
        const fbError = fbJson?.error || fbText;
        console.error(`Error posting to /${pageId}/feed:`, fbError);
        return NextResponse.json(
          { error: "Failed to create Facebook post", fbError },
          { status: 400 }
        );
      }

      newPostId = fbJson.id;
    }

    // 3️⃣ Fetch full details
    const detailsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        newPostId
      )}?fields=id,message,created_time,permalink_url,attachments{media_type,media,url},reactions.summary(true).limit(0),comments.summary(true).limit(0)&access_token=${encodeURIComponent(
        pageToken
      )}`
    );
    const detailsText = await detailsRes.text();
    let post = null;
    try {
      post = JSON.parse(detailsText);
    } catch {
      post = { id: newPostId, message, attachments: null };
    }

    const record = {
      owner_id: ADMIN_OWNER_ID,
      facebook_page_id: pageId,
      fb_post_id: post.id,
      message: post.message || message || null,
      permalink_url: post.permalink_url || null,
      created_time: post.created_time
        ? new Date(post.created_time).toISOString()
        : new Date().toISOString(),
      attachments: post.attachments || null,
      reactions_count: post.reactions?.summary?.total_count ?? null,
      comments_count: post.comments?.summary?.total_count ?? null,
    };

    const { error: upsertError } = await supabase
      .from("facebook_page_posts")
      .upsert(record, {
        onConflict: "owner_id,fb_post_id",
      });

    if (upsertError) {
      console.error("Upsert error facebook_page_posts:", upsertError);
    }

    return NextResponse.json({ data: record }, { status: 200 });
  } catch (err) {
    console.error("POST /api/facebook/page-posts error", err);
    return NextResponse.json(
      { error: "Failed to create page post", details: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req) {
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
    const fbPostId = body.fb_post_id;
    const message = (body.message || "").trim();

    if (!fbPostId) {
      return NextResponse.json(
        { error: "fb_post_id is required" },
        { status: 400 }
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 }
      );
    }

    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("page_access_token")
      .eq("owner_id", ADMIN_OWNER_ID)
      .eq("is_active", true)
      .single();

    if (accError) {
      console.error("No instagram_accounts row", accError);
      return NextResponse.json(
        { error: "No active instagram/facebook config found" },
        { status: 400 }
      );
    }

    if (!account.page_access_token) {
      return NextResponse.json(
        { error: "No page access token stored – sync from Facebook again." },
        { status: 400 }
      );
    }

    const pageToken = account.page_access_token;

    const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(fbPostId)}`);
    const params = new URLSearchParams({
      message,
      access_token: pageToken,
    });

    const fbRes = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error editing post ${fbPostId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to edit Facebook post", fbError },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("facebook_page_posts")
      .update({
        message,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ADMIN_OWNER_ID)
      .eq("fb_post_id", fbPostId)
      .select("id, fb_post_id, message, permalink_url, created_time")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/facebook/page-posts error", err);
    return NextResponse.json(
      { error: "Failed to edit page post", details: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
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

    const { searchParams } = new URL(req.url);
    const fbPostId = searchParams.get("fb_post_id");

    if (!fbPostId) {
      return NextResponse.json(
        { error: "fb_post_id query param is required" },
        { status: 400 }
      );
    }

    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("page_access_token")
      .eq("owner_id", ADMIN_OWNER_ID)
      .eq("is_active", true)
      .single();

    if (accError) {
      console.error("No instagram_accounts row", accError);
      return NextResponse.json(
        { error: "No active instagram/facebook config found" },
        { status: 400 }
      );
    }

    if (!account.page_access_token) {
      return NextResponse.json(
        { error: "No page access token stored – sync from Facebook again." },
        { status: 400 }
      );
    }

    const pageToken = account.page_access_token;

    // Delete in Facebook
    const delUrl = `${GRAPH_BASE}/${encodeURIComponent(
      fbPostId
    )}?access_token=${encodeURIComponent(pageToken)}`;

    const fbRes = await fetch(delUrl, { method: "DELETE" });
    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error deleting post ${fbPostId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to delete Facebook post", fbError },
        { status: 400 }
      );
    }

    // Delete from cache
    const { error: deleteError } = await supabase
      .from("facebook_page_posts")
      .delete()
      .eq("owner_id", ADMIN_OWNER_ID)
      .eq("fb_post_id", fbPostId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/facebook/page-posts error", err);
    return NextResponse.json(
      { error: "Failed to delete page post", details: String(err) },
      { status: 500 }
    );
  }
}
