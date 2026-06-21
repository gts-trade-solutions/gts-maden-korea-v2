// app/api/auth/meta/instagram/login/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.META_IG_APP_ID!;
  const redirectUri = process.env.META_IG_REDIRECT_URI!;
  const version = process.env.META_IG_GRAPH_API_VERSION || "v19.0";

  const scopes = [
    "instagram_basic",
    // "pages_show_list",
    // "pages_read_engagement",
    // "instagram_manage_comments",
    // "instagram_manage_messages",
  ];

  const authUrl = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes.join(","));
  authUrl.searchParams.set("response_type", "code");

  // You can later add a real CSRF-protected `state` if needed
  return NextResponse.redirect(authUrl.toString());
}
