// app/api/social/process-scheduled/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

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
async function resolveInstagramBusinessIdAdmin() {
  if (STATIC_IG_BUSINESS_ID && STATIC_IG_ACCESS_TOKEN) {
    return {
      userId: STATIC_IG_OWNER_ID,
      igId: STATIC_IG_BUSINESS_ID,
      accessToken: STATIC_IG_ACCESS_TOKEN,
    };
  }

  let account: any;
  try {
    account = await prisma.instagram_accounts.findFirst({
      where: {
        is_active: true,
        ...(ADMIN_OWNER_ID ? { owner_id: ADMIN_OWNER_ID } : {}),
      },
      select: {
        id: true,
        owner_id: true,
        ig_business_account_id: true,
        facebook_page_id: true,
        access_token: true,
      },
      orderBy: { created_at: "desc" },
    });
  } catch (accError) {
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

    try {
      await prisma.instagram_accounts.update({
        where: { id: account.id },
        data: { ig_business_account_id: igId },
      });
    } catch (updateError) {
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
async function resolveFacebookPageConfig(ownerIdFromJob?: string) {
  let account: any;
  try {
    account = await prisma.instagram_accounts.findFirst({
      where: {
        is_active: true,
        ...(ownerIdFromJob
          ? { owner_id: ownerIdFromJob }
          : ADMIN_OWNER_ID
          ? { owner_id: ADMIN_OWNER_ID }
          : {}),
      },
      select: {
        id: true,
        owner_id: true,
        facebook_page_id: true,
        page_access_token: true,
        ig_business_account_id: true,
      },
      orderBy: { created_at: "desc" },
    });
  } catch (error) {
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

async function publishInstagramPost(job: any): Promise<{ ig_media_id: string }> {
  const { message, media_url, media_type } = job;
  if (!media_url) {
    throw new Error("Scheduled Instagram post missing media_url.");
  }

  const { userId, igId, accessToken: igToken } =
    await resolveInstagramBusinessIdAdmin();

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

  const caption = media.caption || message || null;
  const mediaType = media.media_type || type || null;
  const mediaUrl = media.media_url || media_url || null;
  const thumbnailUrl = media.thumbnail_url || null;
  const permalink = media.permalink || null;
  const likeCount =
    typeof media.like_count === "number" ? media.like_count : null;
  const commentsCount =
    typeof media.comments_count === "number" ? media.comments_count : null;
  const timestamp = media.timestamp ? new Date(media.timestamp) : new Date();

  try {
    await prisma.instagram_media_posts.upsert({
      where: {
        owner_id_ig_media_id: { owner_id: userId, ig_media_id: media.id },
      },
      create: {
        id: randomUUID(),
        owner_id: userId,
        ig_business_account_id: igId,
        ig_media_id: media.id,
        caption,
        media_type: mediaType,
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl,
        permalink,
        like_count: likeCount,
        comments_count: commentsCount,
        timestamp,
      },
      update: {
        ig_business_account_id: igId,
        caption,
        media_type: mediaType,
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl,
        permalink,
        like_count: likeCount,
        comments_count: commentsCount,
        timestamp,
      },
    });
  } catch (upsertError) {
    console.error("Upsert error instagram_media_posts:", upsertError);
  }

  return { ig_media_id: igMediaId };
}

async function publishFacebookPost(job: any): Promise<{ fb_post_id: string }> {
  const { message, media_url, owner_id } = job;

  const { pageId, pageToken, ownerId } = await resolveFacebookPageConfig(
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

  const messageVal = p.message || message || null;
  const permalinkUrl = p.permalink_url || null;
  const attachments = p.attachments ?? null;
  const createdTime = p.created_time ? new Date(p.created_time) : new Date();
  const insights = p.insights ?? null;
  const reactionsCount = p.reactions?.summary?.total_count ?? null;
  const commentsCount = p.comments?.summary?.total_count ?? null;

  try {
    await prisma.facebook_page_posts.upsert({
      where: {
        owner_id_fb_post_id: { owner_id: ownerId, fb_post_id: p.id },
      },
      create: {
        id: randomUUID(),
        owner_id: ownerId,
        facebook_page_id: pageId,
        fb_post_id: p.id,
        message: messageVal,
        permalink_url: permalinkUrl,
        attachments,
        created_time: createdTime,
        insights,
        reactions_count: reactionsCount,
        comments_count: commentsCount,
      },
      update: {
        facebook_page_id: pageId,
        message: messageVal,
        permalink_url: permalinkUrl,
        attachments,
        created_time: createdTime,
        insights,
        reactions_count: reactionsCount,
        comments_count: commentsCount,
      },
    });
  } catch (upsertError) {
    console.error("Upsert error facebook_page_posts:", upsertError);
  }

  return { fb_post_id: fbPostId };
}

// ---------- Main processor ----------

export async function POST() {
  try {
    const now = new Date();

    // Grab a small batch of due jobs
    let jobs: any[];
    try {
      jobs = await prisma.social_scheduled_posts.findMany({
        where: { status: "pending", scheduled_at: { lte: now } },
        orderBy: { scheduled_at: "asc" },
        take: 5,
      });
    } catch (error: any) {
      console.error("Error loading pending schedules:", error);
      return NextResponse.json(
        {
          error: "Failed to load pending scheduled posts",
          details: error?.message || String(error),
        },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ processed: 0, results: [] }, { status: 200 });
    }

    const results: any[] = [];

    for (const job of jobs) {
      // mark as processing
      await prisma.social_scheduled_posts.update({
        where: { id: job.id },
        data: { status: "processing", last_error: null, error_message: null },
      });

      try {
        if (job.platform === "instagram") {
          const { ig_media_id } = await publishInstagramPost(job);
          await prisma.social_scheduled_posts.update({
            where: { id: job.id },
            data: {
              status: "posted",
              ig_media_id,
              posted_at: new Date(),
            },
          });

          results.push({ id: job.id, ok: true, platform: "instagram" });
        } else if (job.platform === "facebook") {
          const { fb_post_id } = await publishFacebookPost(job);
          await prisma.social_scheduled_posts.update({
            where: { id: job.id },
            data: {
              status: "posted",
              fb_post_id,
              posted_at: new Date(),
            },
          });

          results.push({ id: job.id, ok: true, platform: "facebook" });
        } else {
          throw new Error(`Unsupported platform: ${job.platform}`);
        }
      } catch (err: any) {
        console.error("scheduled post failed", job.id, err);
        const msg = err?.message || String(err);
        await prisma.social_scheduled_posts.update({
          where: { id: job.id },
          data: {
            status: "failed",
            last_error: msg,
            error_message: msg,
          },
        });

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
