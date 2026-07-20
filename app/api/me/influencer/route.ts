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
  const { user } = await getRouteAuth(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { getInfluencerProfileMysql } = await import("@/lib/data/influencer");
  const prof = await getInfluencerProfileMysql(user.id);
  return NextResponse.json({ ok: true, handle: prof?.handle ?? null, influencer: prof });

}
