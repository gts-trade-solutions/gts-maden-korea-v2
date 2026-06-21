export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { getVisitorIdentity } from "@/lib/analytics/identity";

const BACKFILL_WINDOW_DAYS = 30;

/**
 * Stitch a freshly-authed user's `user_id` onto their pre-signup
 * anonymous events, then emit a `login` or `signup` event under the
 * same browser cookies.
 *
 * Called from the login / signup / OAuth-callback success handlers
 * (fire-and-forget on the client). Server reads the anon/session
 * cookies, uses the service-role admin client to UPDATE the prior
 * anon-only rows, and inserts the marker event. Honors
 * `profiles.tracking_consent = false`.
 *
 * Backfill is bounded to the last 30 days — older activity is unlikely
 * to belong to the same person and the window keeps the UPDATE cheap.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const kindRaw = String(body?.kind || "login").toLowerCase();
    const kind: "login" | "signup" =
      kindRaw === "signup" ? "signup" : "login";

    // Resolve the just-authed user from the route-handler client (reads
    // sb-* cookies that supabase auth-helpers writes).
    const { user, sb } = await getRouteAuth(req);
    const userId = user?.id ?? null;
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "UNAUTH" },
        { status: 401 }
      );
    }

    // Consent gate.
    const { data: prof } = await sb
      .from("profiles")
      .select("tracking_consent")
      .eq("id", userId)
      .maybeSingle();
    if (prof && prof.tracking_consent === false) {
      return NextResponse.json({ ok: true, written: 0, skipped: "consent" });
    }

    const { anonId, sessionId } = getVisitorIdentity();
    if (!anonId || !sessionId) {
      return NextResponse.json({
        ok: true,
        written: 0,
        skipped: "no_identity",
      });
    }

    const admin = createAdminClient();
    const cutoff = new Date(
      Date.now() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // Backfill: attach this user_id to every anon-only row from this
    // browser within the window. Past rows that already have a user_id
    // are left alone (they belong to a different account).
    const { data: backfilled, error: upErr } = await admin
      .from("events")
      .update({ user_id: userId })
      .eq("anon_id", anonId)
      .is("user_id", null)
      .gte("occurred_at", cutoff)
      .select("id");

    const backfilledCount = backfilled?.length ?? 0;

    // Marker event for the funnel and for "users-by-source" cohorts.
    const { error: insErr } = await admin.from("events").insert({
      user_id: userId,
      anon_id: anonId,
      session_id: sessionId,
      event_name: kind,
      path: "/api/events/identify",
      props: {
        backfilled_rows: backfilledCount,
      },
    });

    return NextResponse.json({
      ok: true,
      kind,
      backfilled: backfilledCount,
      backfill_error: upErr?.message ?? null,
      insert_error: insErr?.message ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "identify_failed" },
      { status: 500 }
    );
  }
}
