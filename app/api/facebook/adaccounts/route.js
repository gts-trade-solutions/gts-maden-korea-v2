// app/api/facebook/adaccounts/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { ADMIN_OWNER_ID } from "@/lib/adminOwner";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const NO_OWNER = {
  error:
    "ADMIN_OWNER_ID / FB_OWNER_ID env not set. Please set FB_OWNER_ID to the owner user UUID.",
};

// 🔹 GET = just read current connection from DB (no pages list)
export async function GET() {
  try {
    if (!ADMIN_OWNER_ID) {
      return NextResponse.json(NO_OWNER, { status: 400 });
    }

    const account = await prisma.instagram_accounts.findFirst({
      where: { owner_id: ADMIN_OWNER_ID, is_active: true },
      select: {
        id: true,
        owner_id: true,
        username: true,
        ig_business_account_id: true,
        facebook_page_id: true,
      },
      orderBy: { created_at: "desc" },
    });

    if (!account) {
      return NextResponse.json(
        {
          data: null,
          message: "No active Instagram/Facebook account found",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ data: jsonSafe(account) }, { status: 200 });
  } catch (err) {
    console.error("GET /api/facebook/adaccounts unexpected error", err);
    return NextResponse.json(
      { error: "Failed to load account connection" },
      { status: 500 }
    );
  }
}

// 🔹 POST = fetch Pages + IG Biz from Graph and store primary page
export async function POST() {
  try {
    if (!ADMIN_OWNER_ID) {
      return NextResponse.json(NO_OWNER, { status: 400 });
    }

    // 1️⃣ Get current instagram_accounts row for our admin owner
    const account = await prisma.instagram_accounts.findFirst({
      where: { owner_id: ADMIN_OWNER_ID, is_active: true },
      orderBy: { created_at: "desc" },
    });

    if (!account) {
      return NextResponse.json(
        { error: "No active instagram account config found" },
        { status: 400 }
      );
    }

    if (!account.access_token) {
      return NextResponse.json(
        { error: "Missing access token on instagram_accounts" },
        { status: 400 }
      );
    }

    const accessToken = account.access_token;

    // 2️⃣ Fetch Facebook Pages + IG business account
    const pagesRes = await fetch(
      `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(
        accessToken
      )}`
    );

    const pagesText = await pagesRes.text();
    let pagesJson = null;
    try {
      pagesJson = JSON.parse(pagesText);
    } catch {}

    if (!pagesRes.ok) {
      const fbError = pagesJson?.error || pagesText;
      console.error("Error fetching /me/accounts:", fbError);
      return NextResponse.json(
        {
          error: "Failed to fetch Facebook Pages",
          fbError,
        },
        { status: 400 }
      );
    }

    const pages = pagesJson?.data || [];
    const primaryPage = pages[0] || null;
    const igBiz = primaryPage?.instagram_business_account || null;

    // 3️⃣ Update instagram_accounts with Page + IG info
    const updatePayload = {
      facebook_page_id: primaryPage?.id || account.facebook_page_id,
      ig_business_account_id:
        igBiz?.id || account.ig_business_account_id,
      username: igBiz?.username || account.username,
      page_access_token:
        primaryPage?.access_token || account.page_access_token,
      updated_at: new Date(),
    };

    let updated;
    try {
      updated = await prisma.instagram_accounts.update({
        where: { id: account.id },
        data: updatePayload,
        select: {
          id: true,
          owner_id: true,
          username: true,
          ig_business_account_id: true,
          facebook_page_id: true,
        },
      });
    } catch (updateError) {
      console.error("Update instagram_accounts error:", updateError);
      return NextResponse.json(
        { error: "Failed to update account with Facebook Page" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        data: jsonSafe(updated),
        pages,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/facebook/adaccounts error", err);
    return NextResponse.json(
      { error: "Failed to sync Facebook Pages", details: String(err) },
      { status: 500 }
    );
  }
}
