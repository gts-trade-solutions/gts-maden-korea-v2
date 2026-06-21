import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/auth/routeUser";
import { supabaseForUser, rpcForUser } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Resolve the user via the backend-aware seam — the bare cookie client's
  // auth.getUser() returns null under NextAuth (no Supabase session).
  const user = await getRouteUser(req);

  // Not logged-in → send to Register-as-Influencer
  if (!user) {
    const u = new URL(req.url);
    u.pathname = "/auth/register";
    u.searchParams.set("mode", "influencer");
    return NextResponse.redirect(u);
  }

  // Logged-in → ensure there is a pending request (idempotent). request_influencer
  // is auth.uid()-based, so route through the service-role seam + the
  // request_influencer_as(p_user_id, …) wrapper (else it no-ops under NextAuth).
  try {
    const sb = supabaseForUser(user.id);
    await rpcForUser(sb, user.id, "request_influencer", {
      p_handle: null,
      p_social: {},
      p_note: null,
    });
    // Mirror the request into MySQL (the influencer status route reads it there).
    try {
      const { mirrorInfluencerRequestIntoMysql } = await import("@/lib/data/influencer");
      await mirrorInfluencerRequestIntoMysql(sb, user.id);
    } catch (e) {
      console.error("[start] influencer request MySQL mirror failed:", e);
    }
  } catch (e) {
    // Ignore errors like "already approved" — the portal gate decides.
    console.error("[start] request_influencer failed (continuing to portal):", e);
  }

  const to = new URL("/influencer", req.url);
  return NextResponse.redirect(to);
}
