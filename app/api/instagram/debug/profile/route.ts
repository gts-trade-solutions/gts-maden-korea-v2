// app/api/instagram/debug/profile/route.ts
import { NextResponse } from "next/server";
import { getActiveInstagramAccount } from "@/lib/instagram";

const GRAPH_BASE =
  process.env.META_IG_GRAPH_API_BASE || "https://graph.facebook.com";
const GRAPH_VERSION = process.env.META_IG_GRAPH_API_VERSION || "v19.0";

export async function GET() {
  try {
    const account = await getActiveInstagramAccount();
    if (!account) {
      return NextResponse.json(
        { error: "No active Instagram account configured" },
        { status: 400 }
      );
    }

    const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${account.ig_business_account_id}` +
      `?fields=id,username,name,followers_count,media_count` +
      `&access_token=${encodeURIComponent(account.access_token)}`;

    const igRes = await fetch(url);
    const igJson = await igRes.json();

    if (!igRes.ok) {
      console.error("IG debug error:", igJson);
      return NextResponse.json(
        { error: igJson.error || "Instagram API error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: igJson });
  } catch (err: any) {
    console.error("Debug profile error:", err);
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}