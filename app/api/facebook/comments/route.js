// app/api/facebook/comments/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// Optional: lock everything to one admin owner
const ADMIN_OWNER_ID = process.env.FB_OWNER_ID || null;

function getAdminSupabase() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Supabase URL or SERVICE_ROLE key missing in environment variables"
    );
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    }
  );
}

/**
 * Load Facebook Page config from instagram_accounts
 * Uses latest active row (optionally filtered by ADMIN_OWNER_ID)
 */
async function getFacebookConfigAdmin(supabase) {
  let query = supabase
    .from("instagram_accounts")
    .select("id, owner_id, facebook_page_id, page_access_token")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ADMIN_OWNER_ID) {
    query = query.eq("owner_id", ADMIN_OWNER_ID);
  }

  const { data: account, error: accError } = await query;

  if (accError) {
    console.error("instagram_accounts error:", accError);
    throw new Error("Failed to load instagram/facebook config");
  }
  if (!account) {
    throw new Error("No active instagram/facebook config found");
  }

  if (!account.facebook_page_id) {
    throw new Error("No Facebook Page ID stored – sync from Facebook first.");
  }
  if (!account.page_access_token) {
    throw new Error(
      "No page access token stored – re-sync from Facebook/Instagram settings."
    );
  }

  return {
    ownerId: ADMIN_OWNER_ID || account.owner_id,
    pageId: account.facebook_page_id,
    pageToken: account.page_access_token,
  };
}

/**
 * GET /api/facebook/comments?fb_post_id=POST_ID
 * - Fetch comments from Graph, cache into facebook_page_comments, return DB list
 */
export async function GET(req) {
  try {
    const supabase = getAdminSupabase();
    const { searchParams } = new URL(req.url);
    const fbPostId = searchParams.get("fb_post_id");

    if (!fbPostId) {
      return NextResponse.json(
        { error: "fb_post_id query param is required" },
        { status: 400 }
      );
    }

    const { ownerId, pageId, pageToken } = await getFacebookConfigAdmin(
      supabase
    );

    // 1️⃣ Fetch comments from Graph API
    const commentsUrl = `${GRAPH_BASE}/${encodeURIComponent(
      fbPostId
    )}/comments?fields=id,from,message,created_time,like_count,comment_count,is_hidden&filter=stream&order=reverse_chronological&limit=50&access_token=${encodeURIComponent(
      pageToken
    )}`;

    const fbRes = await fetch(commentsUrl);
    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error fetching comments for ${fbPostId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to fetch comments", fbError },
        { status: 400 }
      );
    }

    const comments = fbJson?.data || [];

    // 2️⃣ Upsert into DB
    if (comments.length > 0) {
      const records = comments.map((c) => ({
        owner_id: ownerId,
        facebook_page_id: pageId,
        fb_post_id: fbPostId,
        fb_comment_id: c.id,
        parent_comment_id: null, // only top-level for now
        message: c.message || null,
        from_id: c.from?.id || null,
        from_name: c.from?.name || null,
        created_time: c.created_time
          ? new Date(c.created_time).toISOString()
          : null,
        like_count: c.like_count ?? null,
        comment_count: c.comment_count ?? null,
        is_hidden: c.is_hidden ?? null,
      }));

      const { error: upsertError } = await supabase
        .from("facebook_page_comments")
        .upsert(records, {
          onConflict: "owner_id,fb_comment_id",
        });

      if (upsertError) {
        console.error("Upsert facebook_page_comments error:", upsertError);
      }
    }

    // 3️⃣ Read from DB and return
    const { data: cached, error: cachedError } = await supabase
      .from("facebook_page_comments")
      .select(
        "id, fb_comment_id, fb_post_id, message, from_name, from_id, created_time, like_count, comment_count, is_hidden"
      )
      .eq("owner_id", ownerId)
      .eq("fb_post_id", fbPostId)
      .order("created_time", { ascending: false });

    if (cachedError) throw cachedError;

    return NextResponse.json({ data: cached }, { status: 200 });
  } catch (err) {
    console.error("GET /api/facebook/comments error", err);
    return NextResponse.json(
      { error: "Failed to load comments", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/facebook/comments
 * body: { fb_post_id OR parent_comment_id, message }
 * - Adds a comment to the post or a reply to another comment
 */
export async function POST(req) {
  try {
    const supabase = getAdminSupabase();
    const { ownerId, pageId, pageToken } = await getFacebookConfigAdmin(
      supabase
    );

    const body = await req.json();
    const fbPostId = body.fb_post_id || null;
    const parentCommentId = body.parent_comment_id || null;
    const message = (body.message || "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 }
      );
    }
    const targetId = parentCommentId || fbPostId;
    if (!targetId) {
      return NextResponse.json(
        { error: "fb_post_id or parent_comment_id is required" },
        { status: 400 }
      );
    }

    // 1️⃣ Create comment via Graph API
    const url = new URL(
      `${GRAPH_BASE}/${encodeURIComponent(targetId)}/comments`
    );
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
      console.error(`Error creating comment on ${targetId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to create comment", fbError },
        { status: 400 }
      );
    }

    const newCommentId = fbJson.id;

    // 2️⃣ Fetch comment details
    const detailsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        newCommentId
      )}?fields=id,from,message,created_time,like_count,comment_count,is_hidden&access_token=${encodeURIComponent(
        pageToken
      )}`
    );
    const detailsText = await detailsRes.text();
    let detailsJson = null;
    try {
      detailsJson = JSON.parse(detailsText);
    } catch {}

    const c = detailsJson || { id: newCommentId, message };
    const record = {
      owner_id: ownerId,
      facebook_page_id: pageId,
      fb_post_id: fbPostId || null,
      fb_comment_id: c.id,
      parent_comment_id: parentCommentId || null,
      message: c.message || message,
      from_id: c.from?.id || null,
      from_name: c.from?.name || null,
      created_time: c.created_time
        ? new Date(c.created_time).toISOString()
        : new Date().toISOString(),
      like_count: c.like_count ?? null,
      comment_count: c.comment_count ?? null,
      is_hidden: c.is_hidden ?? null,
    };

    const { error: upsertError } = await supabase
      .from("facebook_page_comments")
      .upsert(record, {
        onConflict: "owner_id,fb_comment_id",
      });

    if (upsertError) {
      console.error("Upsert facebook_page_comments error:", upsertError);
    }

    return NextResponse.json({ data: record }, { status: 200 });
  } catch (err) {
    console.error("POST /api/facebook/comments error", err);
    return NextResponse.json(
      { error: "Failed to create comment", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/facebook/comments
 * body: { fb_comment_id, is_hidden }
 * - Hide / unhide a comment
 */
export async function PATCH(req) {
  try {
    const supabase = getAdminSupabase();
    const { ownerId, pageToken } = await getFacebookConfigAdmin(supabase);

    const body = await req.json();
    const fbCommentId = body.fb_comment_id;
    const isHidden = body.is_hidden;

    if (!fbCommentId) {
      return NextResponse.json(
        { error: "fb_comment_id is required" },
        { status: 400 }
      );
    }

    if (typeof isHidden !== "boolean") {
      return NextResponse.json(
        { error: "is_hidden must be true or false" },
        { status: 400 }
      );
    }

    // 1️⃣ Call Graph API to hide/unhide
    const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(fbCommentId)}`);
    const params = new URLSearchParams({
      is_hidden: isHidden ? "true" : "false",
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
      console.error(`Error hiding/unhiding comment ${fbCommentId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to update comment visibility", fbError },
        { status: 400 }
      );
    }

    // 2️⃣ Update cached record
    const { data: updated, error: updateError } = await supabase
      .from("facebook_page_comments")
      .update({ is_hidden: isHidden })
      .eq("owner_id", ownerId)
      .eq("fb_comment_id", fbCommentId)
      .select(
        "id, fb_comment_id, fb_post_id, message, from_name, from_id, created_time, like_count, comment_count, is_hidden"
      )
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/facebook/comments error", err);
    return NextResponse.json(
      { error: "Failed to update comment", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/facebook/comments?fb_comment_id=...
 * - Delete comment on Facebook + from DB cache
 */
export async function DELETE(req) {
  try {
    const supabase = getAdminSupabase();
    const { ownerId, pageToken } = await getFacebookConfigAdmin(supabase);

    const { searchParams } = new URL(req.url);
    const fbCommentId = searchParams.get("fb_comment_id");

    if (!fbCommentId) {
      return NextResponse.json(
        { error: "fb_comment_id query param is required" },
        { status: 400 }
      );
    }

    // 1️⃣ Delete comment in Graph
    const delUrl = `${GRAPH_BASE}/${encodeURIComponent(
      fbCommentId
    )}?access_token=${encodeURIComponent(pageToken)}`;

    const fbRes = await fetch(delUrl, { method: "DELETE" });
    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error deleting comment ${fbCommentId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to delete comment", fbError },
        { status: 400 }
      );
    }

    // 2️⃣ Remove from DB cache
    const { error: deleteError } = await supabase
      .from("facebook_page_comments")
      .delete()
      .eq("owner_id", ownerId)
      .eq("fb_comment_id", fbCommentId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/facebook/comments error", err);
    return NextResponse.json(
      { error: "Failed to delete comment", details: String(err) },
      { status: 500 }
    );
  }
}
