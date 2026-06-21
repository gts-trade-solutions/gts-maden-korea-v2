// app/api/me/influencer/route.ts
//
// Returns the caller's influencer profile record (or {ok: true,
// influencer: null} if they don't have one). Used by:
//   • /influencer/links — needs the handle to build /r/<handle>?p=<slug>
//     share links. The page used to fetch this exact endpoint, but the
//     route didn't exist — handle never loaded, generator was broken.
//
// Scoped narrowly to the fields the dashboard surfaces actually need.
// Keep it that way; if a future page needs more, add a separate route
// instead of fattening this response.

import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user, sb } = await getRouteAuth(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (process.env.CATALOG_BACKEND === "mysql") {
    try {
      const { getInfluencerProfileMysql } = await import("@/lib/data/influencer");
      const prof = await getInfluencerProfileMysql(user.id);
      return NextResponse.json({ ok: true, handle: prof?.handle ?? null, influencer: prof });
    } catch (e) {
      console.error("[me/influencer] MySQL read failed, falling back to Supabase:", e);
    }
  }

  const { data, error } = await sb
    .from("influencer_profiles")
    .select("handle, display_name, active, applicable_countries")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // Mirror `handle` at the top level too — the existing /influencer/links
  // page reads `mj?.handle` rather than `mj.influencer.handle`. Keeping
  // both shapes means the page works as-is without an additional patch.
  return NextResponse.json({
    ok: true,
    handle: data?.handle ?? null,
    influencer: data ?? null,
  });
}
