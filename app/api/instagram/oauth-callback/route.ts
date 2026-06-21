import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

// Where to send user back in admin after connect
const INSTAGRAM_SETTINGS_URL =
  process.env.NEXT_PUBLIC_SITE_URL + "/admin/settings/instagram";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    const redirect = new URL(INSTAGRAM_SETTINGS_URL);
    redirect.searchParams.set(
      "error",
      error || "Missing authorization code from Meta"
    );
    return NextResponse.redirect(redirect);
  }

  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const redirectUri =
    process.env.NEXT_PUBLIC_SITE_URL + "/api/instagram/oauth-callback";

  // 1) Exchange code -> short-lived user token
  const tokenRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?client_id=${encodeURIComponent(
      appId
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&client_secret=${encodeURIComponent(
      appSecret
    )}&code=${encodeURIComponent(code)}`
  );
  const tokenJson: any = await tokenRes.json();

  if (!tokenRes.ok) {
    console.error("Meta code exchange failed", tokenJson);
    const redirect = new URL(INSTAGRAM_SETTINGS_URL);
    redirect.searchParams.set("error", "Failed to get access token from Meta");
    return NextResponse.redirect(redirect);
  }

  const shortLivedUserToken = tokenJson.access_token as string;

  // 2) Upgrade to long-lived user token
  const llRes = await fetch(
    `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(
      appId
    )}&client_secret=${encodeURIComponent(
      appSecret
    )}&fb_exchange_token=${encodeURIComponent(shortLivedUserToken)}`
  );
  const llJson: any = await llRes.json();

  if (!llRes.ok) {
    console.error("Meta long-lived token failed", llJson);
    const redirect = new URL(INSTAGRAM_SETTINGS_URL);
    redirect.searchParams.set("error", "Failed to get long-lived token");
    return NextResponse.redirect(redirect);
  }

  const longLivedUserToken = llJson.access_token as string;

  // 3) Get page + IG business account for this user
  const accountsRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=name,id,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(
      longLivedUserToken
    )}`
  );
  const accountsJson: any = await accountsRes.json();

  if (!accountsRes.ok) {
    console.error("Meta /me/accounts failed", accountsJson);
    const redirect = new URL(INSTAGRAM_SETTINGS_URL);
    redirect.searchParams.set("error", "Failed to fetch Facebook Pages");
    return NextResponse.redirect(redirect);
  }

  const firstPage = accountsJson.data?.[0];
  if (!firstPage || !firstPage.instagram_business_account) {
    const redirect = new URL(INSTAGRAM_SETTINGS_URL);
    redirect.searchParams.set(
      "error",
      "No Facebook Page with Instagram Business account was found"
    );
    return NextResponse.redirect(redirect);
  }

  const facebookPageId = firstPage.id as string;
  const pageAccessToken = firstPage.access_token as string;
  const igBusinessAccountId = firstPage.instagram_business_account.id as string;
  const igUsername = firstPage.instagram_business_account.username as string;

  // 4) Optional: get actual expiry timestamp for token
  const debugRes = await fetch(
    `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(
      longLivedUserToken
    )}&access_token=${encodeURIComponent(appId + "|" + appSecret)}`
  );
  const debugJson: any = await debugRes.json();
  let tokenExpiresAt: string | null = null;
  if (debugRes.ok && debugJson?.data?.expires_at) {
    tokenExpiresAt = new Date(
      debugJson.data.expires_at * 1000
    ).toISOString();
  }

  // 5) Save to instagram_accounts for current Supabase user
  const { user, sb } = await getRouteAuth(req);

  if (!user) {
    console.error("No user in oauth callback");
    const redirect = new URL(INSTAGRAM_SETTINGS_URL);
    redirect.searchParams.set(
      "error",
      "You must be logged in to connect Instagram"
    );
    return NextResponse.redirect(redirect);
  }

  const record = {
    owner_id: user.id,
    ig_business_account_id: igBusinessAccountId,
    username: igUsername,
    access_token: longLivedUserToken,
    token_expires_at: tokenExpiresAt,
    is_active: true,
    facebook_page_id: facebookPageId,
    page_access_token: pageAccessToken,
  };

  const { error: upsertError } = await sb
    .from("instagram_accounts")
    .upsert(record, { onConflict: "owner_id,ig_business_account_id" });

  if (upsertError) {
    console.error("Upsert instagram_accounts failed", upsertError);
    const redirect = new URL(INSTAGRAM_SETTINGS_URL);
    redirect.searchParams.set(
      "error",
      "Saved connection in Meta but failed to store in database"
    );
    return NextResponse.redirect(redirect);
  }

  // 6) Back to settings with success
  const redirect = new URL(INSTAGRAM_SETTINGS_URL);
  redirect.searchParams.set("success", "connected");
  return NextResponse.redirect(redirect);
}
