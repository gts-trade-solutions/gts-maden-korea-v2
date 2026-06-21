// app/api/social/run-scheduler/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// Same env you already use elsewhere
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_OWNER_ID = process.env.FB_OWNER_ID || null; // optional fixed owner

function getAdminSupabase() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase URL or SERVICE_ROLE_KEY env missing");
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Re-uses the same logic you already have in instagram/media:
 * resolve IG business id + access token from instagram_accounts
 */
async function resolveInstagramBusinessIdAdmin(supabase) {
  let query = supabase
    .from("instagram_accounts")
    .select("id, owner_id, ig_business_account_id, facebook_page_id, access_token")
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
      "No IG access token stored – update token in the Instagram settings page."
    );
  }

  // If IG id missing or looks like page id, resolve via page
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
      "No Instagram Business Account ID – re-sync from Facebook/Instagram settings."
    );
  }

  return { userId, igId, accessToken: token };
}

/**
 * Actually posts ONE Instagram job via Graph API
 * Expects job.payload = { caption?, message?, media_url, media_type? }
 */
async function processInstagramJob(
  supabase,
  job
) {
  const { userId, igId, accessToken } =
    await resolveInstagramBusinessIdAdmin(supabase);

  const payload = job.payload || {};
  const caption =
    (payload.caption || payload.message || "").toString().trim();
  const mediaUrl = (payload.media_url || "").toString().trim();
  const mediaType = (payload.media_type || "IMAGE").toString().toUpperCase(); // IMAGE | VIDEO

  if (!mediaUrl) {
    throw new Error("Scheduled Instagram job missing media_url in payload");
  }

  // Step 1: create container
  const containerUrl = new URL(
    `${GRAPH_BASE}/${encodeURIComponent(igId)}/media`
  );
  const params = new URLSearchParams({
    access_token: accessToken,
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
    console.error("IG container error:", fbError);
    throw new Error(
      typeof fbError === "string" ? fbError : fbError?.message || "IG container error"
    );
  }

  const creationId = containerJson.id;
  if (!creationId) {
    throw new Error("No creation_id returned from Instagram");
  }

  // Step 2: publish
  const publishUrl = new URL(
    `${GRAPH_BASE}/${encodeURIComponent(igId)}/media_publish`
  );
  const publishParams = new URLSearchParams({
    creation_id: creationId,
    access_token: accessToken,
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
    console.error("IG publish error:", fbError);
    throw new Error(
      typeof fbError === "string" ? fbError : fbError?.message || "IG publish error"
    );
  }

  const igMediaId = publishJson.id;

  // optional: fetch final details
  const detailsRes = await fetch(
    `${GRAPH_BASE}/${encodeURIComponent(
      igMediaId
    )}?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&access_token=${encodeURIComponent(
      accessToken
    )}`
  );
  const detailsText = await detailsRes.text();
  let detailsJson = null;
  try {
    detailsJson = JSON.parse(detailsText);
  } catch {}

  const media = detailsJson || {
    id: igMediaId,
    caption,
    media_type: mediaType,
    media_url: mediaUrl,
  };

  // cache into instagram_media_posts
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
    .upsert(record, { onConflict: "owner_id,ig_media_id" });

  if (upsertError) {
    console.error("Upsert instagram_media_posts error:", upsertError);
  }

  return igMediaId ;
}

export async function POST() {
  try {
    const supabase = getAdminSupabase();

    const nowIso = new Date().toISOString();

    // 1️⃣ Pick due, pending jobs
    const { data: jobs, error } = await supabase
      .from("social_scheduled_posts")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(10); // safety limit per run

    if (error) {
      console.error("Load scheduled jobs error:", error);
      return NextResponse.json(
        { error: "Failed to load scheduled posts" },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json(
        { processed: 0, message: "No due jobs" },
        { status: 200 }
      );
    }

    let processed = 0;
    const results = [];

    for (const job of jobs) {
      try {
        let externalId = null;

        if (job.platform === "instagram") {
          externalId = await processInstagramJob(supabase, job);
        } else if (job.platform === "facebook") {
          // TODO: implement facebook posting similar to IG
          // for now we just skip or mark as failed
          throw new Error("Facebook scheduler not implemented yet");
        } else {
          throw new Error(`Unknown platform: ${job.platform}`);
        }

        processed += 1;

        const updatePayload = {
          status: "posted",
          posted_at: new Date().toISOString(),
          last_error: null,
        };

        if (job.platform === "instagram") {
          updatePayload.instagram_media_id = externalId;
        } else if (job.platform === "facebook") {
          updatePayload.facebook_post_id = externalId;
        }

        await supabase
          .from("social_scheduled_posts")
          .update(updatePayload)
          .eq("id", job.id);

        results.push({ id: job.id, ok: true, externalId });
      } catch (jobErr) {
        console.error("Error processing job", job.id, jobErr);

        await supabase
          .from("social_scheduled_posts")
          .update({
            status: "failed",
            last_error: String(jobErr?.message || jobErr),
          })
          .eq("id", job.id);

        results.push({
          id: job.id,
          ok: false,
          error: String(jobErr?.message || jobErr),
        });
      }
    }

    return NextResponse.json(
      { processed, results },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/social/run-scheduler error", err);
    return NextResponse.json(
      { error: "Scheduler failed", details: String(err?.message || err) },
      { status: 500 }
    );
  }
}
