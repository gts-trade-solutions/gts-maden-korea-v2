// POST /api/auth/oauth-signup-complete
//
// Idempotent post-OAuth onboarding hook. Called from the OAuth callback
// page on every successful auth (both new signups AND returning logins),
// and only does work when it detects a brand-new account:
//
//   1. profiles.email_verified_at is null (we haven't already onboarded)
//   2. profiles.created_at is within the last 5 minutes (it really is a
//      fresh signup, not someone who happened to log in via OAuth months
//      after creating a password-based account that's still unverified)
//   3. the account was created via a real OAuth provider — detected by an
//      auth_accounts (Prisma `Account`) row linking the user to google /
//      facebook / etc. Credentials-only signups have no such row.
//
// When those line up we:
//   - mark profiles.email_verified_at = now() (Google verified the email
//     on their side, so our gate would be redundant)
//   - send the welcome email (with trending products)
//   - fire the admin "user_signed_up" bell notification
//
// Returns ok:true regardless — callers don't need to do anything either
// way. The `skipped` field on the response is purely diagnostic.

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { sendWelcomeEmail } from "@/lib/auth/sendWelcomeEmail";
import { createAdminNotification } from "@/lib/admin/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anything older than this is considered a returning login, not a fresh
// signup. 5 minutes is generous — the OAuth round-trip takes a few
// seconds at most, even on slow networks.
const FRESH_SIGNUP_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    // Identity from the NextAuth session (cookie-based). Replaces the old
    // supabase.auth.getUser() + Bearer-token resolution.
    const sessionUser = await getSessionUser();
    const userId = sessionUser?.id ?? null;
    if (!userId) {
      return NextResponse.json(
        { ok: false, reason: "unauthenticated" },
        { status: 401 }
      );
    }

    const [account, profile, dbUser] = await Promise.all([
      prisma.account.findFirst({
        where: { userId },
        select: { provider: true },
      }),
      prisma.profiles.findUnique({
        where: { id: userId },
        select: {
          created_at: true,
          email_verified_at: true,
          full_name: true,
          preferred_locale: true,
          preferred_country: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
    ]);

    const email = dbUser?.email ?? sessionUser?.email ?? null;
    if (!email) {
      return NextResponse.json({ ok: true, skipped: "no_email" });
    }
    if (!profile) {
      return NextResponse.json({ ok: true, skipped: "no_profile" });
    }

    // Already onboarded — returning user (most common path through this
    // route). Nothing to do.
    if (profile.email_verified_at) {
      return NextResponse.json({ ok: true, skipped: "already_verified" });
    }

    // Profile too old to be considered a fresh signup. Likely a
    // pre-existing password account that the user just OAuth'd into for
    // the first time. We don't auto-verify in that case — let them go
    // through the normal verification flow.
    const profileAge = profile.created_at
      ? Date.now() - new Date(profile.created_at).getTime()
      : Number.POSITIVE_INFINITY;
    if (profileAge > FRESH_SIGNUP_WINDOW_MS) {
      return NextResponse.json({ ok: true, skipped: "not_fresh" });
    }

    // Defence: only auto-verify when the account was actually created via a
    // third-party provider that verified the email itself. A credentials
    // signup has no auth_accounts row (it registers through /api/auth/register
    // and wouldn't normally land here anyway).
    const provider = account?.provider ?? null;
    if (!provider) {
      return NextResponse.json({ ok: true, skipped: "not_oauth" });
    }

    // 1. Mark our local verification flag — Google/Facebook/etc. only
    //    return an email after the user proved control of it. updateMany
    //    tolerates a missing profiles row (the verification gate reads
    //    email_verified_at from here).
    await prisma.profiles.updateMany({
      where: { id: userId },
      data: { email_verified_at: new Date() },
    });

    // 2. Welcome email — same template + trending products as the
    //    password-signup path. Best-effort.
    try {
      await sendWelcomeEmail({
        email,
        name: (profile.full_name as string | null) ?? null,
        locale: (profile.preferred_locale as string | null) ?? null,
        country: (profile.preferred_country as string | null) ?? null,
        origin: req.nextUrl.origin,
      });
    } catch (e) {
      console.error("[oauth-signup-complete] welcome email failed:", e);
    }

    // 3. Admin bell — mirror the password-signup notification but tag
    //    the provider in the body so admins can see at a glance how
    //    the customer arrived.
    void createAdminNotification({
      type: "user_signed_up",
      title: `New customer signed up — ${email}`,
      body:
        ((profile.full_name as string | null) ?? "").trim() ||
        `via ${provider}`,
      link: `/admin/users?q=${encodeURIComponent(email)}`,
      severity: "info",
      meta: {
        user_id: userId,
        provider,
        country: (profile.preferred_country as string | null) ?? null,
      },
      createdBy: userId,
    });

    return NextResponse.json({ ok: true, fired: true, provider });
  } catch (err) {
    console.error("[oauth-signup-complete] unexpected error:", err);
    return NextResponse.json(
      { ok: false, reason: "internal_error" },
      { status: 500 }
    );
  }
}
