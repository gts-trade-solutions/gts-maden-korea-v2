// app/api/auth/meta/instagram/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // User must be logged into your app first
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    console.error("Meta OAuth error:", error);
    return NextResponse.redirect(
      new URL("/instagram/settings?error=Instagram+OAuth+failed", req.url)
    );
  }

  const clientId = process.env.META_IG_APP_ID!;
  const clientSecret = process.env.META_IG_APP_SECRET!;
  const redirectUri = process.env.META_IG_REDIRECT_URI!;
  const graphBase =
    process.env.META_IG_GRAPH_API_BASE || "https://graph.facebook.com";
  const version = process.env.META_IG_GRAPH_API_VERSION || "v19.0";

  try {
    // 1) Exchange code -> short-lived access token
    const tokenRes = await fetch(
      `${graphBase}/${version}/oauth/access_token` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&client_secret=${encodeURIComponent(clientSecret)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&code=${encodeURIComponent(code)}`
    );
    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error("Token exchange error:", tokenJson);
      throw new Error(
        tokenJson.error?.message || "Failed to get access token from Meta"
      );
    }

    const shortToken = tokenJson.access_token as string;

    // 2) Optional but recommended: exchange for long-lived token
    let finalToken = shortToken;
    let expiresAt: string | null = null;

    const longRes = await fetch(
      `${graphBase}/${version}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&client_secret=${encodeURIComponent(clientSecret)}` +
        `&fb_exchange_token=${encodeURIComponent(shortToken)}`
    );
    const longJson = await longRes.json();

    if (longRes.ok && longJson.access_token) {
      finalToken = longJson.access_token as string;
      const expiresInSec: number | undefined = longJson.expires_in;
      if (expiresInSec) {
        expiresAt = new Date(
          Date.now() + expiresInSec * 1000
        ).toISOString();
      }
    } else {
      // If exchange fails, just use short-lived token
      const expiresInSec: number | undefined = tokenJson.expires_in;
      if (expiresInSec) {
        expiresAt = new Date(
          Date.now() + expiresInSec * 1000
        ).toISOString();
      }
    }

    // 3) Get Pages the user manages
    const pagesRes = await fetch(
      `${graphBase}/${version}/me/accounts?access_token=${encodeURIComponent(
        finalToken
      )}`
    );
    const pagesJson = await pagesRes.json();

    if (!pagesRes.ok) {
      console.error("Pages fetch error:", pagesJson);
      throw new Error(
        pagesJson.error?.message || "Failed to load managed Pages"
      );
    }

    const pages = pagesJson.data || [];

    // Find first Page that has an Instagram business account connected
    let chosenPage: any = null;
    let igBusinessId: string | null = null;

    for (const page of pages) {
      const pageDetailRes = await fetch(
        `${graphBase}/${version}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(
          finalToken
        )}`
      );
      const pageDetailJson = await pageDetailRes.json();

      if (pageDetailJson.instagram_business_account?.id) {
        chosenPage = page;
        igBusinessId = pageDetailJson.instagram_business_account.id;
        break;
      }
    }

    if (!igBusinessId || !chosenPage) {
      throw new Error(
        "No Instagram Business account linked to any of your Pages."
      );
    }

    // 4) Get Instagram username
    const igRes = await fetch(
      `${graphBase}/${version}/${igBusinessId}?fields=username&access_token=${encodeURIComponent(
        finalToken
      )}`
    );
    const igJson = await igRes.json();

    if (!igRes.ok) {
      console.error("IG account fetch error:", igJson);
      throw new Error(
        igJson.error?.message || "Failed to load Instagram Business account"
      );
    }

    const username: string | null = igJson.username || null;

    // 5) Save into instagram_accounts
    const { error: upsertErr } = await supabase
      .from("instagram_accounts")
      .upsert(
        {
          owner_id: user.id,
          ig_business_account_id: igBusinessId,
          username,
          access_token: finalToken,
          token_expires_at: expiresAt,
          is_active: true,
          facebook_page_id: chosenPage.id,
          page_access_token: chosenPage.access_token, // useful later for DMs
        },
        {
          onConflict: "owner_id, ig_business_account_id",
        }
      );

    if (upsertErr) {
      console.error("instagram_accounts upsert error:", upsertErr);
      throw new Error("Failed to save Instagram account in database");
    }

    // 6) Redirect back to settings with success flag
    const redirect = new URL("/instagram/settings?connected=1", req.url);
    return NextResponse.redirect(redirect);
  } catch (err: any) {
    console.error("Meta Instagram callback error:", err);

    const redirect = new URL(
      `/instagram/settings?error=${encodeURIComponent(
        err.message || "Instagram+connection+failed"
      )}`,
      req.url
    );
    return NextResponse.redirect(redirect);
  }
}
