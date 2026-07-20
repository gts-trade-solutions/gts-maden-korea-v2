import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

export async function GET(req: NextRequest) {
  const { user } = await getRouteAuth(req);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Read path behind the flag: MySQL (mirrored) vs Supabase (authoritative).
  // Auth above stays on Supabase until the auth-session flip.
  const { getInfluencerSummaryMysql } = await import("@/lib/data/influencer");
  const summary = await getInfluencerSummaryMysql(user.id);
  return NextResponse.json({ ok: true, ...summary });

}
