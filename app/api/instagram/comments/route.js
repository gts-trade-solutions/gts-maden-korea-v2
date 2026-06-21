// app/api/instagram/comments/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
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

// 🔹 Shared helper: resolve IG business account + token, using instagram_accounts
async function resolveInstagramBusinessIdAdmin(supabase) {
  let query = supabase
    .from("instagram_accounts")
    .select(
      "id, owner_id, ig_business_account_id, facebook_page_id, access_token"
    )
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
    throw new Error("Failed to load Instagram account config");
  }

  if (!account) {
    throw new Error("No active Instagram account config found");
  }

  let igId = account.ig_business_account_id;
  const pageId = account.facebook_page_id;
  const token = account.access_token;
  const userId = ADMIN_OWNER_ID || account.owner_id;

  if (!token) {
    throw new Error(
      "No IG access token stored – re-sync from Facebook / Instagram settings."
    );
  }

  const looksLikePage = igId && pageId && igId === pageId;
  const isProbablyNotIG = igId && !String(igId).startsWith("178");

  if ((!igId || looksLikePage || isProbablyNotIG) && pageId) {
    const pageRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        pageId
      )}?fields=instagram_business_account&access_token=${encodeURIComponent(
        token
      )}`
    );

    const pageText = await pageRes.text();
    let pageJson = null;
    try {
      pageJson = JSON.parse(pageText);
    } catch {}

    if (!pageRes.ok) {
      const fbError = pageJson?.error || pageText;
      console.error(
        `Error resolving instagram_business_account for page ${pageId}:`,
        fbError
      );
      throw new Error(
        "Failed to resolve Instagram Business Account from Facebook Page"
      );
    }

    const newIgId = pageJson?.instagram_business_account?.id;
    if (!newIgId) {
      throw new Error(
        "No instagram_business_account.id found for this Facebook Page"
      );
    }

    igId = newIgId;

    const { error: updateError } = await supabase
      .from("instagram_accounts")
      .update({ ig_business_account_id: igId })
      .eq("id", account.id);

    if (updateError) {
      console.error(
        "Failed to update ig_business_account_id in instagram_accounts:",
        updateError
      );
    }
  }

  if (!igId) {
    throw new Error(
      "No Instagram Business Account ID available – sync from Facebook again."
    );
  }

  return {
    userId,
    igId,
    accessToken: token,
  };
}

/**
 * GET /api/instagram/comments?ig_media_id=...
 * - Fetch IG comments from Graph
 * - Map fields → instagram_comments
 * - Cache + return from DB
 */
export async function GET(req) {
  try {
    const supabase = getAdminSupabase();
    const { searchParams } = new URL(req.url);
    const igMediaId = searchParams.get("ig_media_id");

    if (!igMediaId) {
      return NextResponse.json(
        { error: "ig_media_id query param is required" },
        { status: 400 }
      );
    }

    let userId, igId, igToken;
    try {
      const resolved = await resolveInstagramBusinessIdAdmin(supabase);
      userId = resolved.userId;
      igId = resolved.igId;
      igToken = resolved.accessToken;
    } catch (e) {
      console.error("Error resolving IG business id (GET comments):", e);
      return NextResponse.json(
        { error: e.message || "Failed to resolve Instagram account" },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch comments from IG Graph
    const url = `${GRAPH_BASE}/${encodeURIComponent(
      igMediaId
    )}/comments?fields=id,text,username,like_count,timestamp&limit=50&access_token=${encodeURIComponent(
      igToken
    )}`;

    const fbRes = await fetch(url);
    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error fetching IG comments for ${igMediaId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to fetch Instagram comments", fbError },
        { status: 400 }
      );
    }

    const comments = fbJson?.data || [];

    // 2️⃣ Upsert into instagram_comments
    if (comments.length > 0) {
      const records = comments.map((c) => ({
        owner_id: userId,
        ig_business_account_id: igId,
        ig_media_id: igMediaId,
        ig_comment_id: c.id,
        from_username: c.username || null,
        message: c.text || null,
        is_hidden: false, // IG API doesn't expose hidden flag here; keep local
        like_count:
          typeof c.like_count === "number" ? c.like_count : null,
        created_time: c.timestamp
          ? new Date(c.timestamp).toISOString()
          : null,
      }));

      const { error: upsertError } = await supabase
        .from("instagram_comments")
        .upsert(records, {
          onConflict: "owner_id,ig_comment_id",
        });

      if (upsertError) {
        console.error("Upsert instagram_comments error:", upsertError);
      }
    }

    // 3️⃣ Read from DB for consistent structure
    const { data: cached, error: cachedError } = await supabase
      .from("instagram_comments")
      .select(
        "id, ig_comment_id, ig_media_id, ig_business_account_id, from_username, message, is_hidden, like_count, created_time"
      )
      .eq("owner_id", userId)
      .eq("ig_media_id", igMediaId)
      .order("created_time", { ascending: false });

    if (cachedError) throw cachedError;

    return NextResponse.json({ data: cached }, { status: 200 });
  } catch (err) {
    console.error("GET /api/instagram/comments error", err);
    return NextResponse.json(
      { error: "Failed to load Instagram comments", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/instagram/comments
 * body: { ig_media_id OR parent_comment_id, message }
 * - Create comment or reply on IG
 * - Cache into instagram_comments
 */
export async function POST(req) {
  try {
    const supabase = getAdminSupabase();

    const body = await req.json();
    const igMediaId = body.ig_media_id || null;
    const parentCommentId = body.parent_comment_id || null;
    const message = (body.message || body.text || "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "message/text cannot be empty" },
        { status: 400 }
      );
    }

    const targetId = parentCommentId || igMediaId;
    if (!targetId) {
      return NextResponse.json(
        { error: "ig_media_id or parent_comment_id is required" },
        { status: 400 }
      );
    }

    let userId, igId, igToken;
    try {
      const resolved = await resolveInstagramBusinessIdAdmin(supabase);
      userId = resolved.userId;
      igId = resolved.igId;
      igToken = resolved.accessToken;
    } catch (e) {
      console.error("Error resolving IG business id (POST comments):", e);
      return NextResponse.json(
        { error: e.message || "Failed to resolve Instagram account" },
        { status: 400 }
      );
    }

    // 1️⃣ Create comment via IG Graph
    const url = new URL(
      `${GRAPH_BASE}/${encodeURIComponent(targetId)}/comments`
    );
    const params = new URLSearchParams({
      message, // IG uses "message" to create the comment text
      access_token: igToken,
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
      console.error(`Error creating IG comment on ${targetId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to create Instagram comment", fbError },
        { status: 400 }
      );
    }

    const newCommentId = fbJson.id;

    // 2️⃣ Fetch comment details
    const detailsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        newCommentId
      )}?fields=id,text,username,like_count,timestamp&access_token=${encodeURIComponent(
        igToken
      )}`
    );
    const detailsText = await detailsRes.text();
    let detailsJson = null;
    try {
      detailsJson = JSON.parse(detailsText);
    } catch {}

    const c = detailsJson || { id: newCommentId, text: message };
    const record = {
      owner_id: userId,
      ig_business_account_id: igId,
      ig_media_id: igMediaId || null,
      ig_comment_id: c.id,
      from_username: c.username || null,
      message: c.text || message,
      is_hidden: false,
      like_count:
        typeof c.like_count === "number" ? c.like_count : null,
      created_time: c.timestamp
        ? new Date(c.timestamp).toISOString()
        : new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("instagram_comments")
      .upsert(record, {
        onConflict: "owner_id,ig_comment_id",
      });

    if (upsertError) {
      console.error("Upsert instagram_comments error:", upsertError);
    }

    return NextResponse.json({ data: record }, { status: 200 });
  } catch (err) {
    console.error("POST /api/instagram/comments error", err);
    return NextResponse.json(
      { error: "Failed to create Instagram comment", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/instagram/comments
 * body: { ig_comment_id, is_hidden }
 * - Dashboard-only hide/unhide (no IG Graph support for hide)
 */
export async function PATCH(req) {
  try {
    const supabase = getAdminSupabase();

    const body = await req.json();
    const igCommentId = body.ig_comment_id;
    const isHidden = body.is_hidden;

    if (!igCommentId) {
      return NextResponse.json(
        { error: "ig_comment_id is required" },
        { status: 400 }
      );
    }

    if (typeof isHidden !== "boolean") {
      return NextResponse.json(
        { error: "is_hidden must be true or false" },
        { status: 400 }
      );
    }

    let userId;
    try {
      const resolved = await resolveInstagramBusinessIdAdmin(supabase);
      userId = resolved.userId;
    } catch (e) {
      console.error("Error resolving IG business id (PATCH comments):", e);
      return NextResponse.json(
        { error: e.message || "Failed to resolve Instagram account" },
        { status: 400 }
      );
    }

    // 🔹 Local-only flag – IG Graph doesn't hide comments like FB
    const { data: updated, error: updateError } = await supabase
      .from("instagram_comments")
      .update({ is_hidden: isHidden })
      .eq("owner_id", userId)
      .eq("ig_comment_id", igCommentId)
      .select(
        "id, ig_comment_id, ig_media_id, ig_business_account_id, from_username, message, is_hidden, like_count, created_time"
      )
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/instagram/comments error", err);
    return NextResponse.json(
      { error: "Failed to update Instagram comment", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/instagram/comments?ig_comment_id=...
 * - Delete IG comment via Graph + remove from instagram_comments
 */
export async function DELETE(req) {
  try {
    const supabase = getAdminSupabase();

    let userId, igToken;
    try {
      const resolved = await resolveInstagramBusinessIdAdmin(supabase);
      userId = resolved.userId;
      igToken = resolved.accessToken;
    } catch (e) {
      console.error("Error resolving IG business id (DELETE comments):", e);
      return NextResponse.json(
        { error: e.message || "Failed to resolve Instagram account" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const igCommentId = searchParams.get("ig_comment_id");

    if (!igCommentId) {
      return NextResponse.json(
        { error: "ig_comment_id query param is required" },
        { status: 400 }
      );
    }

    // 1️⃣ Delete from IG Graph
    const delUrl = `${GRAPH_BASE}/${encodeURIComponent(
      igCommentId
    )}?access_token=${encodeURIComponent(igToken)}`;

    const fbRes = await fetch(delUrl, { method: "DELETE" });
    const fbText = await fbRes.text();
    let fbJson = null;
    try {
      fbJson = JSON.parse(fbText);
    } catch {}

    if (!fbRes.ok) {
      const fbError = fbJson?.error || fbText;
      console.error(`Error deleting IG comment ${igCommentId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to delete Instagram comment", fbError },
        { status: 400 }
      );
    }

    // 2️⃣ Remove from DB cache
    const { error: deleteError } = await supabase
      .from("instagram_comments")
      .delete()
      .eq("owner_id", userId)
      .eq("ig_comment_id", igCommentId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/instagram/comments error", err);
    return NextResponse.json(
      { error: "Failed to delete Instagram comment", details: String(err) },
      { status: 500 }
    );
  }
}
