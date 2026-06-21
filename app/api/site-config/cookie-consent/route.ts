// GET /api/site-config/cookie-consent
//
// Public endpoint returning the cookie consent banner's display delay.
// The banner client polls this on first visit; CDN-cached so it costs
// ~nothing per page load.
//
// Bounded: 1..60 seconds. Outside that range falls back to 7.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let delaySeconds = 7;
  let scrollThreshold = 1;
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data } = await sb
      .from("store_settings")
      .select("cookie_consent_delay_seconds, cookie_consent_scroll_threshold")
      .eq("id", 1)
      .maybeSingle();
    const v = Number(data?.cookie_consent_delay_seconds);
    if (Number.isFinite(v) && v >= 1 && v <= 60) delaySeconds = Math.floor(v);
    const s = Number(data?.cookie_consent_scroll_threshold);
    if (Number.isFinite(s) && s >= 1 && s <= 20) scrollThreshold = Math.floor(s);
  } catch {
    /* fall through to defaults */
  }
  return NextResponse.json(
    { delaySeconds, scrollThreshold },
    {
      headers: {
        // Short edge cache — the values change rarely. 5 min keeps the
        // origin quiet without making changes feel sticky.
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    }
  );
}
