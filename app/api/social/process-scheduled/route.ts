// app/api/social/process-scheduled/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// ---------- Supabase admin client ----------
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
    { auth: { persistSession: false } }
  );
}

// Optional admin owner lock (same as other routes)
const ADMIN_OWNER_ID = process.env.FB_OWNER_ID || null;

// Static IG env shortcut
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

// ---------- Shared helpers ----------

// Poll the IG media container until it's ready (or fails)
async function waitForContainerReady(
  creationId: string,
  igToken: string,
  options: { maxAttempts?: number; delayMs?: number } = {}
) {
  const { maxAttempts = 8, delayMs = 2000 } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const statusRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(
        creationId
      )}?fields=status_code,status&access_token=${encodeURIComponent(igToken)}`
    );

    const statusText = await statusRes.text();
    let statusJson: any = null;
    try {
      statusJson = JSON.parse(statusText);
    } catch {
      // ignore parse error
    }

    if (!statusRes.ok) {
      console.warn(
        `Container status check failed (attempt ${attempt}):`,
        statusJson?.error || statusText
      );
    } else {
      const statusCode = statusJson?.status_code;
      if (statusCode === "FINISHED") return;
      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        throw new Error(
          `Media container status is ${statusCode} – Instagram could not process this media.`
        );
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    "Media is still not ready after multiple attempts – Instagram says to wait longer or try again."
  );
}

// Resolve IG Business account (same as /api/instagram/media)
async function resolveInstagramBusinessIdAdmin(supabase: any) {
  if (STATIC_IG_BUSINESS_ID && STATIC_IG_ACCESS_TOKEN) {
    return {
      userId: STATIC_IG_OWNER_ID,
      igId: STATIC_IG_BUSINESS_ID,
      accessToken: STATIC_IG_ACCESS_TOKEN,
    };
  }

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
    console.error("instagram_accounts error:", accError);
    throw new Error(
      "Failed to load Instagram account config from database (check instagram_accounts table)."
    );
  }
  if (!account) {
    throw new Error("No active Instagram account config found.");
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

  // If IG ID looks wrong, resolve from page
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
    let pageJson: any = null;
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
        "Failed to resolve Instagram Business Account from Facebook Page."
      );
    }

    const newIgId = pageJson?.instagram_business_account?.id;
    if (!newIgId) {
      throw new Error(
        "No instagram_business_account.id found for this Facebook Page – ensure it is linked to an IG business account."
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
      "No Instagram Business Account ID available – please sync from Facebook settings again."
    );
  }

  return { userId, igId, accessToken: token };
}

// Resolve Facebook Page + token from instagram_accounts
async function resolveFacebookPageConfig(
  supabase: any,
  ownerIdFromJob?: string
) {
  let query = supabase
    .from("instagram_accounts")
    .select(
      "id, owner_id, facebook_page_id, page_access_token, ig_business_account_id"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (ownerIdFromJob) {
    query = query.eq("owner_id", ownerIdFromJob);
  } else if (ADMIN_OWNER_ID) {
    query = query.eq("owner_id", ADMIN_OWNER_ID);
  }

  const { data: account, error } = await query.maybeSingle();
  if (error) {
    console.error("instagram_accounts FB config error:", error);
    throw new Error(
      "Failed to load Facebook Page config from instagram_accounts table."
    );
  }
  if (!account?.facebook_page_id || !account?.page_access_token) {
    throw new Error(
      "Facebook Page ID or Page access token is missing in instagram_accounts."
    );
  }

  return {
    pageId: account.facebook_page_id as string,
    pageToken: account.page_access_token as string,
    ownerId: account.owner_id as string,
  };
}

// ---------- Publish helpers ----------

async function publishInstagramPost(
  supabase: any,
  job: any
): Promise<{ ig_media_id: string }> {
  const { message, media_url, media_type } = job;
  if (!media_url) {
    throw new Error("Scheduled Instagram post missing media_url.");
  }

  const { userId, igId, accessToken: igToken } =
    await resolveInstagramBusinessIdAdmin(supabase);

  // 1) Create media container
  const containerUrl = new URL(
    `${GRAPH_BASE}/${encodeURIComponent(igId)}/media`
  );
  const params = new URLSearchParams({ access_token: igToken });

  const type = (media_type || "IMAGE").toUpperCase();
  if (type === "VIDEO") {
    params.set("media_type", "VIDEO");
    params.set("video_url", media_url);
  } else {
    params.set("image_url", media_url);
  }

  if (message) {
    params.set("caption", message);
  }

  const containerRes = await fetch(containerUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const containerText = await containerRes.text();
  let containerJson: any = null;
  try {
    containerJson = JSON.parse(containerText);
  } catch {}

  if (!containerRes.ok) {
    const fbError = containerJson?.error || containerText;
    console.error("IG create container error", fbError);
    throw new Error(
      fbError?.error_user_msg ||
        fbError?.message ||
        "Failed to create Instagram media container."
    );
  }

  const creationId = containerJson.id;
  if (!creationId) {
    throw new Error("No creation_id returned from Instagram.");
  }

  // 1.5) Wait until container is ready
  await waitForContainerReady(creationId, igToken);

  // 2) Publish
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
  let publishJson: any = null;
  try {
    publishJson = JSON.parse(publishText);
  } catch {}

  if (!publishRes.ok) {
    const fbError = publishJson?.error || publishText;
    console.error("IG media_publish error", fbError);
    throw new Error(
      fbError?.error_user_msg ||
        fbError?.message ||
        "Failed to publish Instagram media."
    );
  }

  const igMediaId = publishJson.id;
  if (!igMediaId) {
    throw new Error("No IG media id returned after publish.");
  }

  // 3) Fetch details
  const detailsRes = await fetch(
    `${GRAPH_BASE}/${encodeURIComponent(
      igMediaId
    )}?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&access_token=${encodeURIComponent(
      igToken
    )}`
  );
  const detailsText = await detailsRes.text();
  let mediaJson: any = null;
  try {
    mediaJson = JSON.parse(detailsText);
  } catch {}

  if (!detailsRes.ok) {
    console.error(
      "Error fetching new IG media details:",
      mediaJson || detailsText
    );
  }

  const media = mediaJson || {
    id: igMediaId,
    caption: message,
    media_type: type,
    media_url,
  };

  const record = {
    owner_id: userId,
    ig_business_account_id: igId,
    ig_media_id: media.id,
    caption: media.caption || message || null,
    media_type: media.media_type || type || null,
    media_url: media.media_url || media_url || null,
    thumbnail_url: media.thumbnail_url || null,
    permalink: media.permalink || null,
    like_count:
      typeof media.like_count === "number" ? media.like_count : null,
    comments_count:
      typeof media.comments_count === "number" ? media.comments_count : null,
    timestamp: media.timestamp
      ? new Date(media.timestamp).toISOString()
      : new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("instagram_media_posts")
    .upsert(record, { onConflict: "owner_id,ig_media_id" });

  if (upsertError) {
    console.error("Upsert error instagram_media_posts:", upsertError);
  }

  return { ig_media_id: igMediaId };
}

async function publishFacebookPost(
  supabase: any,
  job: any
): Promise<{ fb_post_id: string }> {
  const { message, media_url, media_type, owner_id } = job;

  const { pageId, pageToken, ownerId } = await resolveFacebookPageConfig(
    supabase,
    owner_id
  );

  let fbPostId: string | null = null;

  if (media_url) {
    // Photo post
    const params = new URLSearchParams({
      url: media_url,
      access_token: pageToken,
    });
    if (message) params.set("caption", message);

    const res = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(pageId)}/photos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (!res.ok) {
      const fbError = json?.error || text;
      console.error("FB photo post error:", fbError);
      throw new Error(
        fbError?.error_user_msg ||
          fbError?.message ||
          "Failed to create Facebook photo post."
      );
    }

    fbPostId = json.post_id || json.id;
  } else {
    // Text-only post
    if (!message) {
      throw new Error(
        "Facebook scheduled post has no message and no media_url."
      );
    }
    const params = new URLSearchParams({
      message,
      access_token: pageToken,
    });

    const res = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(pageId)}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (!res.ok) {
      const fbError = json?.error || text;
      console.error("FB feed post error:", fbError);
      throw new Error(
        fbError?.error_user_msg ||
          fbError?.message ||
          "Failed to create Facebook feed post."
      );
    }

    fbPostId = json.id;
  }

  if (!fbPostId) {
    throw new Error("No fb_post_id returned from Facebook.");
  }

  // Fetch details for cache
  const detailRes = await fetch(
    `${GRAPH_BASE}/${encodeURIComponent(
      fbPostId
    )}?fields=id,message,created_time,permalink_url,attachments{media_type,media,url},reactions.summary(true).limit(0),comments.summary(true).limit(0)&access_token=${encodeURIComponent(
      pageToken
    )}`
  );
  const detailText = await detailRes.text();
  let detailJson: any = null;
  try {
    detailJson = JSON.parse(detailText);
  } catch {}

  if (!detailRes.ok) {
    console.error("FB detail fetch error:", detailJson || detailText);
  }

  const p = detailJson || { id: fbPostId, message };

  const record = {
    owner_id: ownerId,
    facebook_page_id: pageId,
    fb_post_id: p.id,
    message: p.message || message || null,
    permalink_url: p.permalink_url || null,
    attachments: p.attachments || null,
    created_time: p.created_time
      ? new Date(p.created_time).toISOString()
      : new Date().toISOString(),
    insights: p.insights || null,
    reactions_count: p.reactions?.summary?.total_count ?? null,
    comments_count: p.comments?.summary?.total_count ?? null,
  };

  const { error: upsertError } = await supabase
    .from("facebook_page_posts")
    .upsert(record, { onConflict: "owner_id,fb_post_id" });

  if (upsertError) {
    console.error("Upsert error facebook_page_posts:", upsertError);
  }

  return { fb_post_id: fbPostId };
}

// ---------- Main processor ----------

export async function POST() {
  try {
    const supabase = getAdminSupabase();
    const nowIso = new Date().toISOString();

    // Grab a small batch of due jobs
    const { data: jobs, error } = await supabase
      .from("social_scheduled_posts")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(5);

    if (error) {
      console.error("Error loading pending schedules:", error);
      return NextResponse.json(
        {
          error: "Failed to load pending scheduled posts",
          details: error.message || String(error),
        },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json(
        { processed: 0, results: [] },
        { status: 200 }
      );
    }

    const results: any[] = [];

    for (const job of jobs) {
      // mark as processing
      await supabase
        .from("social_scheduled_posts")
        .update({ status: "processing", last_error: null, error_message: null })
        .eq("id", job.id);

      try {
        if (job.platform === "instagram") {
          const { ig_media_id } = await publishInstagramPost(supabase, job);
          await supabase
            .from("social_scheduled_posts")
            .update({
              status: "posted",
              ig_media_id,
              posted_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          results.push({ id: job.id, ok: true, platform: "instagram" });
        } else if (job.platform === "facebook") {
          const { fb_post_id } = await publishFacebookPost(supabase, job);
          await supabase
            .from("social_scheduled_posts")
            .update({
              status: "posted",
              fb_post_id,
              posted_at: new Date().toISOString(),
            })
            .eq("id", job.id);

          results.push({ id: job.id, ok: true, platform: "facebook" });
        } else {
          throw new Error(`Unsupported platform: ${job.platform}`);
        }
      } catch (err: any) {
        console.error("scheduled post failed", job.id, err);
        const msg = err?.message || String(err);
        await supabase
          .from("social_scheduled_posts")
          .update({
            status: "failed",
            last_error: msg,
            error_message: msg,
          })
          .eq("id", job.id);

        results.push({ id: job.id, ok: false, error: msg });
      }
    }

    return NextResponse.json(
      { processed: results.length, results },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("POST /api/social/process-scheduled error", err);
    return NextResponse.json(
      {
        error: "Failed to process scheduled posts",
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
