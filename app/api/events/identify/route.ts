export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";
import { getVisitorIdentity } from "@/lib/analytics/identity";

const BACKFILL_WINDOW_DAYS = 30;

/**
 * Stitch a freshly-authed user's `user_id` onto their pre-signup
 * anonymous events, then emit a `login` or `signup` event under the
 * same browser cookies.
 *
 * Called from the login / signup / OAuth-callback success handlers
 * (fire-and-forget on the client). Server reads the anon/session
 * cookies, uses Prisma to UPDATE the prior anon-only rows, and inserts
 * the marker event. Honors `profiles.tracking_consent = false`.
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

    // Resolve the just-authed user from the NextAuth session.
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "UNAUTH" },
        { status: 401 }
      );
    }

    // Consent gate.
    const prof = await prisma.profiles.findUnique({
      where: { id: userId },
      select: { tracking_consent: true },
    });
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

    const cutoff = new Date(
      Date.now() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    // Backfill: attach this user_id to every anon-only row from this
    // browser within the window. Past rows that already have a user_id
    // are left alone (they belong to a different account).
    let backfilledCount = 0;
    let backfillError: string | null = null;
    try {
      const res = await prisma.events.updateMany({
        where: {
          anon_id: anonId,
          user_id: null,
          occurred_at: { gte: cutoff },
        },
        data: { user_id: userId },
      });
      backfilledCount = res.count;
    } catch (e: any) {
      backfillError = e?.message ?? null;
    }

    // Marker event for the funnel and for "users-by-source" cohorts.
    let insertError: string | null = null;
    try {
      await prisma.events.create({
        data: {
          id: randomUUID(),
          user_id: userId,
          anon_id: anonId,
          session_id: sessionId,
          event_name: kind,
          path: "/api/events/identify",
          props: {
            backfilled_rows: backfilledCount,
          },
        },
      });
    } catch (e: any) {
      insertError = e?.message ?? null;
    }

    return NextResponse.json({
      ok: true,
      kind,
      backfilled: backfilledCount,
      backfill_error: backfillError,
      insert_error: insertError,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "identify_failed" },
      { status: 500 }
    );
  }
}
