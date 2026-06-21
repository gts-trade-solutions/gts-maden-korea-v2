// app/api/facebook/adaccounts/route.js
import { NextResponse } from "next/server";
import { getAdminSupabase, ADMIN_OWNER_ID } from "@/lib/adminSupabase";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// 🔹 GET = just read current connection from DB (no pages list)
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

    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("id, owner_id, username, ig_business_account_id, facebook_page_id")
      .eq("owner_id", ADMIN_OWNER_ID)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accError) {
      console.error("GET /api/facebook/adaccounts error:", accError);
      return NextResponse.json(
        { error: "Failed to load account connection" },
        { status: 500 }
      );
    }

    if (!account) {
      return NextResponse.json(
        {
          data: null,
          message: "No active Instagram/Facebook account found",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ data: account }, { status: 200 });
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

    // 1️⃣ Get current instagram_accounts row for our admin owner
    const { data: account, error: accError } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("owner_id", ADMIN_OWNER_ID)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accError) {
      console.error("instagram_accounts error:", accError);
      return NextResponse.json(
        { error: "Failed to load instagram account config" },
        { status: 400 }
      );
    }

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
      ig_business_account_id: igBiz?.id || account.ig_business_account_id,
      username: igBiz?.username || account.username,
      page_access_token: primaryPage?.access_token || account.page_access_token,
    };

    const { data: updated, error: updateError } = await supabase
      .from("instagram_accounts")
      .update(updatePayload)
      .eq("id", account.id)
      .select("id, owner_id, username, ig_business_account_id, facebook_page_id")
      .single();

    if (updateError) {
      console.error("Update instagram_accounts error:", updateError);
      return NextResponse.json(
        { error: "Failed to update account with Facebook Page" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        data: updated,
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
