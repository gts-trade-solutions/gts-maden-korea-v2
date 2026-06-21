// app/api/instagram/media/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// Poll the media container until it's ready (or fails)
async function waitForContainerReady(creationId, igToken, options = {}) {
  const {
    maxAttempts = 8, // total polls
    delayMs = 2000, // 2 seconds between polls
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const statusRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        creationId
      )}?fields=status_code,status&access_token=${encodeURIComponent(igToken)}`
    );

    const statusText = await statusRes.text();
    let statusJson = null;
    try {
      statusJson = JSON.parse(statusText);
    } catch {
      // ignore parse error, we’ll just treat as unknown
    }

    if (!statusRes.ok) {
      console.warn(
        `Container status check failed (attempt ${attempt}):`,
        statusJson?.error || statusText
      );
    } else {
      const statusCode = statusJson?.status_code;
      // Common values: FINISHED, IN_PROGRESS, ERROR, EXPIRED
      if (statusCode === "FINISHED") {
        return; // ready to publish
      }
      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        throw new Error(
          `Media container status is ${statusCode} – Instagram could not process this media.`
        );
      }
    }

    // not ready yet → wait and try again
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    "Media is still not ready after multiple attempts – Instagram says to wait longer or try again."
  );
}

// Optional: lock records to a specific owner_id (admin)
const ADMIN_OWNER_ID = process.env.FB_OWNER_ID || null;

// Env fallback (no DB needed)
const STATIC_IG_BUSINESS_ID =
  process.env.IG_BUSINESS_ACCOUNT_ID ||
  process.env.NEXT_PUBLIC_IG_BUSINESS_ACCOUNT_ID ||
  "";
const STATIC_IG_ACCESS_TOKEN =
  process.env.IG_ACCESS_TOKEN || process.env.NEXT_PUBLIC_IG_ACCESS_TOKEN || "";
const STATIC_IG_OWNER_ID =
  process.env.IG_OWNER_ID ||
  ADMIN_OWNER_ID ||
  "00000000-0000-0000-0000-000000000000";

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
 * Resolve IG Business Account ID + token
 * Priority:
 *   1) Environment variables IG_BUSINESS_ACCOUNT_ID + IG_ACCESS_TOKEN
 *   2) Latest active row in instagram_accounts (optionally filtered by ADMIN_OWNER_ID)
 */
async function resolveInstagramBusinessIdAdmin(supabase) {
  // 1️⃣ Env-vars shortcut (recommended – avoids DB + rate limits)
  if (STATIC_IG_BUSINESS_ID && STATIC_IG_ACCESS_TOKEN) {
    return {
      userId: STATIC_IG_OWNER_ID,
      igId: STATIC_IG_BUSINESS_ID,
      accessToken: STATIC_IG_ACCESS_TOKEN,
    };
  }

  // 2️⃣ Fallback to instagram_accounts table
  try {
    let query = supabase
      .from("instagram_accounts")
      .select(
        "id, owner_id, ig_business_account_id, facebook_page_id, access_token"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (ADMIN_OWNER_ID) {
      query = query.eq("owner_id", ADMIN_OWNER_ID);
    }

    const { data: account, error: accError } = await query.maybeSingle();

    if (accError) {
      console.error("instagram_accounts error (Supabase):", accError);
      throw new Error(
        "Failed to load Instagram account config from database (check Supabase URL/key and table)."
      );
    }

    if (!account) {
      throw new Error(
        "No active Instagram account config found (instagram_accounts is empty)."
      );
    }

    let igId = account.ig_business_account_id;
    const pageId = account.facebook_page_id;
    const token = account.access_token;
    const userId = ADMIN_OWNER_ID || account.owner_id;

    if (!token) {
      throw new Error(
        "No IG access token stored in instagram_accounts – please save it in settings."
      );
    }

    // 3️⃣ If IG ID looks wrong, resolve from Page
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
          "Failed to resolve Instagram Business Account from Facebook Page (check Page → IG linkage)."
        );
      }

      const newIgId = pageJson?.instagram_business_account?.id;
      if (!newIgId) {
        throw new Error(
          "No instagram_business_account.id found for this Facebook Page – ensure the page is linked to an IG business account."
        );
      }

      igId = newIgId;

      // Persist IG ID for next time (best-effort)
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
        "No Instagram Business Account ID available – please sync from Facebook / settings again."
      );
    }

    return {
      userId,
      igId,
      accessToken: token,
    };
  } catch (e) {
    // Handle low-level fetch errors (ECONNRESET etc.)
    if (String(e?.message || e).includes("fetch failed")) {
      console.error(
        "Supabase network error in resolveInstagramBusinessIdAdmin:",
        e
      );
      throw new Error(
        "Failed to connect to Supabase to load Instagram config. " +
          "Either set IG_BUSINESS_ACCOUNT_ID + IG_ACCESS_TOKEN env vars, " +
          "or fix the Supabase connection."
      );
    }
    throw e;
  }
}

/**
 * GET /api/instagram/media
 * - Fetch latest media from IG business account
 * - Cache into instagram_media_posts
 * - Remove cache rows that no longer exist on Instagram (within this recent window)
 * - Return list from DB
 */
export async function GET() {
  try {
    const supabase = getAdminSupabase();

    let userId, igId, igToken;
    try {
      const resolved = await resolveInstagramBusinessIdAdmin(supabase);
      userId = resolved.userId;
      igId = resolved.igId;
      igToken = resolved.accessToken;
    } catch (e) {
      console.error("Error resolving IG business id (GET):", e);
      return NextResponse.json(
        { error: e.message || "Failed to resolve Instagram account" },
        { status: 400 }
      );
    }

    // 1️⃣ Fetch media from IG Graph (latest 20)
    const mediaRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        igId
      )}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=20&access_token=${encodeURIComponent(
        igToken
      )}`
    );

    const mediaText = await mediaRes.text();
    let mediaJson = null;
    try {
      mediaJson = JSON.parse(mediaText);
    } catch {}

    if (!mediaRes.ok) {
      const fbError = mediaJson?.error || mediaText;
      console.error(`Error fetching /${igId}/media:`, fbError);
      return NextResponse.json(
        {
          error: "Failed to fetch Instagram media",
          fbError,
        },
        { status: 400 }
      );
    }

    const media = mediaJson?.data || [];

    // 2️⃣ Upsert into DB
    if (media.length > 0) {
      const records = media.map((m) => ({
        owner_id: userId,
        ig_business_account_id: igId,
        ig_media_id: m.id,
        caption: m.caption || null,
        media_type: m.media_type || null,
        media_url: m.media_url || null,
        thumbnail_url: m.thumbnail_url || null,
        permalink: m.permalink || null,
        like_count:
          typeof m.like_count === "number" ? m.like_count : null,
        comments_count:
          typeof m.comments_count === "number" ? m.comments_count : null,
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : null,
      }));

      const { error: upsertError } = await supabase
        .from("instagram_media_posts")
        .upsert(records, {
          onConflict: "owner_id,ig_media_id",
        });

      if (upsertError) {
        console.error("Upsert error instagram_media_posts:", upsertError);
      }
    }

    // 3️⃣ Remove cache rows that are no longer on Instagram
    //    (within this IG account + owner)
    try {
      const remoteIds = new Set(media.map((m) => m.id));

      const { data: cachedRows, error: cacheError } = await supabase
        .from("instagram_media_posts")
        .select("ig_media_id")
        .eq("owner_id", userId)
        .eq("ig_business_account_id", igId);

      if (cacheError) {
        console.error(
          "Error reading cached instagram_media_posts for cleanup:",
          cacheError
        );
      } else if (cachedRows && cachedRows.length > 0) {
        const toDelete = cachedRows
          .map((row) => row.ig_media_id)
          .filter((id) => id && !remoteIds.has(id));

        if (toDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from("instagram_media_posts")
            .delete()
            .eq("owner_id", userId)
            .eq("ig_business_account_id", igId)
            .in("ig_media_id", toDelete);

          if (deleteError) {
            console.error(
              "Error deleting instagram_media_posts no longer on IG:",
              deleteError
            );
          }
        }
      }
    } catch (cleanupErr) {
      console.error(
        "Unexpected error while cleaning up stale instagram_media_posts:",
        cleanupErr
      );
    }

    // 4️⃣ Read from DB so structure is consistent
    const { data: cachedMedia, error: cachedError } = await supabase
      .from("instagram_media_posts")
      .select(
        "id, ig_media_id, caption, media_type, media_url, thumbnail_url, permalink, like_count, comments_count, timestamp"
      )
      .eq("owner_id", userId)
      .eq("ig_business_account_id", igId)
      .order("timestamp", { ascending: false })
      .limit(20);

    if (cachedError) throw cachedError;

    return NextResponse.json(
      {
        data: cachedMedia,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/instagram/media error", err);
    return NextResponse.json(
      { error: "Failed to load Instagram media", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/instagram/media
 * - Create a new IG post (image or video)
 * - Body: { caption?, media_url, media_type? ("IMAGE"|"VIDEO") }
 */
export async function POST(req) {
  try {
    const supabase = getAdminSupabase();

    const body = await req.json();
    const caption = (body.caption || body.message || "").trim();
    const mediaUrl = (body.media_url || "").trim();
    const mediaType = (body.media_type || "IMAGE").toUpperCase(); // IMAGE | VIDEO

    if (!mediaUrl) {
      return NextResponse.json(
        { error: "media_url is required to create Instagram media" },
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
      console.error("Error resolving IG business id (POST):", e);
      return NextResponse.json(
        { error: e.message || "Failed to resolve Instagram account" },
        { status: 400 }
      );
    }

    // 1️⃣ Step 1: create media container
    const containerUrl = new URL(
      `${GRAPH_BASE}/${encodeURIComponent(igId)}/media`
    );
    const params = new URLSearchParams({
      access_token: igToken,
    });

    if (mediaType === "VIDEO") {
      params.set("media_type", "VIDEO");
      params.set("video_url", mediaUrl);
    } else {
      params.set("image_url", mediaUrl);
    }

    if (caption) {
      params.set("caption", caption);
    }

    const containerRes = await fetch(containerUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const containerText = await containerRes.text();
    let containerJson = null;
    try {
      containerJson = JSON.parse(containerText);
    } catch {}

    if (!containerRes.ok) {
      const fbError = containerJson?.error || containerText;
      console.error(
        `Error creating IG media container for ${igId}:`,
        fbError
      );
      return NextResponse.json(
        {
          error: "Failed to create Instagram media container",
          fbError,
        },
        { status: 400 }
      );
    }

    const creationId = containerJson.id;
    if (!creationId) {
      return NextResponse.json(
        { error: "No creation_id returned from Instagram" },
        { status: 400 }
      );
    }

    // 🔁 1.5: WAIT until container is ready
    try {
      await waitForContainerReady(creationId, igToken);
    } catch (waitErr) {
      console.error("Container not ready:", waitErr);
      return NextResponse.json(
        {
          error:
            waitErr.message ||
            "Media is not ready to be published yet. Please try again in a few seconds.",
        },
        { status: 400 }
      );
    }

    // 2️⃣ Step 2: publish the container
    const publishUrl = new URL(
      `${GRAPH_BASE}/${encodeURIComponent(igId)}/media_publish`
    );
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: igToken,
    });

    const publishRes = await fetch(publishUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams.toString(),
    });

    const publishText = await publishRes.text();
    let publishJson = null;
    try {
      publishJson = JSON.parse(publishText);
    } catch {}

    if (!publishRes.ok) {
      const fbError = publishJson?.error || publishText;
      console.error(`Error publishing IG media for ${igId}:`, fbError);
      return NextResponse.json(
        {
          error: "Failed to publish Instagram media",
          fbError,
        },
        { status: 400 }
      );
    }

    const igMediaId = publishJson.id;
    if (!igMediaId) {
      return NextResponse.json(
        { error: "No media id returned after publish" },
        { status: 400 }
      );
    }

    // 3️⃣ Fetch full media details
    const detailsRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        igMediaId
      )}?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&access_token=${encodeURIComponent(
        igToken
      )}`
    );
    const detailsText = await detailsRes.text();
    let detailsJson = null;
    try {
      detailsJson = JSON.parse(detailsText);
    } catch {}

    if (!detailsRes.ok) {
      console.error(
        "Error fetching new IG media details:",
        detailsJson || detailsText
      );
    }

    const media = detailsJson || {
      id: igMediaId,
      caption,
      media_type: mediaType,
      media_url: mediaUrl,
    };

    // 4️⃣ Cache in DB
    const record = {
      owner_id: userId,
      ig_business_account_id: igId,
      ig_media_id: media.id,
      caption: media.caption || caption || null,
      media_type: media.media_type || mediaType || null,
      media_url: media.media_url || mediaUrl || null,
      thumbnail_url: media.thumbnail_url || null,
      permalink: media.permalink || null,
      like_count:
        typeof media.like_count === "number" ? media.like_count : null,
      comments_count:
        typeof media.comments_count === "number"
          ? media.comments_count
          : null,
      timestamp: media.timestamp
        ? new Date(media.timestamp).toISOString()
        : new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("instagram_media_posts")
      .upsert(record, {
        onConflict: "owner_id,ig_media_id",
      });

    if (upsertError) {
      console.error("Upsert error instagram_media_posts:", upsertError);
    }

    return NextResponse.json({ data: record }, { status: 200 });
  } catch (err) {
    console.error("POST /api/instagram/media error", err);
    return NextResponse.json(
      { error: "Failed to create Instagram media", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/instagram/media
 * - Edit caption of an existing IG media (and update cache)
 * - Body: { ig_media_id, caption }
 */
export async function PATCH(req) {
  try {
    const supabase = getAdminSupabase();

    const body = await req.json();
    const igMediaId = body.ig_media_id;
    const caption = (body.caption || "").trim();

    if (!igMediaId) {
      return NextResponse.json(
        { error: "ig_media_id is required" },
        { status: 400 }
      );
    }

    if (!caption) {
      return NextResponse.json(
        { error: "Caption cannot be empty" },
        { status: 400 }
      );
    }

    let userId, igToken;
    try {
      const resolved = await resolveInstagramBusinessIdAdmin(supabase);
      userId = resolved.userId;
      igToken = resolved.accessToken;
    } catch (e) {
      console.error("Error resolving IG business id (PATCH):", e);
      return NextResponse.json(
        { error: e.message || "Failed to resolve Instagram account" },
        { status: 400 }
      );
    }

    // IG Graph requires POST for updates
    const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(igMediaId)}`);
    const params = new URLSearchParams({
      caption,
      comment_enabled: "true",
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
      console.error(`Error editing IG media ${igMediaId}:`, fbError);
      return NextResponse.json(
        { error: "Failed to edit Instagram post caption", fbError },
        { status: 400 }
      );
    }

    // Update cached DB row
    const { data: updated, error: updateError } = await supabase
      .from("instagram_media_posts")
      .update({
        caption,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", userId)
      .eq("ig_media_id", igMediaId)
      .select(
        "id, ig_media_id, caption, media_type, media_url, thumbnail_url, permalink, like_count, comments_count, timestamp"
      )
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/instagram/media error", err);
    return NextResponse.json(
      { error: "Failed to edit Instagram media", details: String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/instagram/media
 * - Delete from dashboard cache (not from real Instagram account)
 * - Query param: ?ig_media_id=...
 */
export async function DELETE(req) {
  try {
    const supabase = getAdminSupabase();

    let userId;
    try {
      const resolved = await resolveInstagramBusinessIdAdmin(supabase);
      userId = resolved.userId;
    } catch (e) {
      console.error("Error resolving IG business id (DELETE):", e);
      return NextResponse.json(
        { error: e.message || "Failed to resolve Instagram account" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const igMediaId = searchParams.get("ig_media_id");

    if (!igMediaId) {
      return NextResponse.json(
        { error: "ig_media_id query param is required" },
        { status: 400 }
      );
    }

    // Dashboard-only delete: we do NOT remove from Instagram, only from cache
    const { error: deleteError } = await supabase
      .from("instagram_media_posts")
      .delete()
      .eq("owner_id", userId)
      .eq("ig_media_id", igMediaId);

    if (deleteError) throw deleteError;

    return NextResponse.json(
      { success: true, deleted_id: igMediaId },
      { status: 200 }
    );
  } catch (err) {
    console.error("DELETE /api/instagram/media error", err);
    return NextResponse.json(
      {
        error:
          "Failed to delete media from dashboard (Instagram post itself is not removed)",
        details: String(err),
      },
      { status: 500 }
    );
  }
}
