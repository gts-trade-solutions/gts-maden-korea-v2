import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { supabaseForUser, rpcForUser } from "@/lib/supabaseRoute";

export async function POST(req: Request) {
  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { handle, social = {}, note } = await req.json().catch(() => ({}));

  // request_influencer is an auth.uid()-based SECURITY DEFINER RPC. Under NextAuth
  // there is no Supabase session, so route through the service-role seam +
  // request_influencer_as(p_user_id, …) wrapper.
  const sb = supabaseForUser(user.id);
  const { data, error } = await rpcForUser(sb, user.id, "request_influencer", {
    p_handle: handle ?? null,
    p_social: social,
    p_note: note ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Mirror the application into MySQL (the status route reads it from MySQL).
  try {
    const { mirrorInfluencerRequestIntoMysql } = await import("@/lib/data/influencer");
    await mirrorInfluencerRequestIntoMysql(sb, user.id);
  } catch (e) {
    console.error("[dual-write] influencer apply MySQL mirror failed:", e);
  }

  return NextResponse.json({ ok: true, request: data });
}
