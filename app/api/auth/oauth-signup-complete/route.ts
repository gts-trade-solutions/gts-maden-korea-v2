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
//   3. auth.users.app_metadata.provider is something other than "email"
//      (defence — only mark verified for OAuth providers, which always
//      pre-verify the email)
//
// When those line up we:
//   - mark profiles.email_verified_at = now() (Google verified the email
//     on their side, so our gate would be redundant)
//   - send the welcome email (with trending products)
//   - fire the admin "user_signed_up" bell notification
//
// Returns ok:true regardless — callers don't need to do anything either
// way. The `skipped` field on the response is purely diagnostic.

import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createServiceClient } from "@/lib/supabaseServer";
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
    const supabase = createRouteHandlerClient({ cookies });
    const h = headers();

    let userId: string | null = null;
    const auth = h.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data } = await supabase.auth.getUser(auth.slice(7));
      userId = data.user?.id ?? null;
    }
    if (!userId) {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    }
    if (!userId) {
      return NextResponse.json(
        { ok: false, reason: "unauthenticated" },
        { status: 401 }
      );
    }

    const admin = createServiceClient();
    const [{ data: authUser }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin
        .from("profiles")
        .select(
          "created_at, email_verified_at, full_name, preferred_locale, preferred_country"
        )
        .eq("id", userId)
        .maybeSingle(),
    ]);

    if (!authUser?.user?.email) {
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
    const profileAge =
      Date.now() - new Date(profile.created_at as string).getTime();
    if (profileAge > FRESH_SIGNUP_WINDOW_MS) {
      return NextResponse.json({ ok: true, skipped: "not_fresh" });
    }

    // Defence: only auto-verify when the auth row was actually created
    // via a third-party provider that verified the email itself.
    // app_metadata.provider is "email" for password signups (which
    // wouldn't normally land on this route anyway — register.tsx already
    // handles them) and "google" / "facebook" / etc. for OAuth.
    const provider =
      (authUser.user.app_metadata as any)?.provider ?? null;
    if (!provider || provider === "email") {
      return NextResponse.json({ ok: true, skipped: "not_oauth" });
    }

    // 1. Mark our local verification flag — Google/Facebook/etc. only
    //    return an email after the user proved control of it.
    await admin
      .from("profiles")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", userId);

    // Dual-write: under AUTH_BACKEND=nextauth the verification gate reads
    // email_verified_at from MySQL, so a Supabase-only update would leave this
    // OAuth signup looking unverified and drifting into the grace/lockout.
    try {
      const { prisma } = await import("@/lib/db/prisma");
      await prisma.profiles.updateMany({
        where: { id: userId },
        data: { email_verified_at: new Date() },
      });
    } catch (e) {
      console.error("[oauth-signup-complete] MySQL email_verified_at mirror failed:", e);
    }

    // 2. Welcome email — same template + trending products as the
    //    password-signup path. Best-effort.
    try {
      await sendWelcomeEmail({
        email: authUser.user.email,
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
      title: `New customer signed up — ${authUser.user.email}`,
      body:
        ((profile.full_name as string | null) ?? "").trim() ||
        `via ${provider}`,
      link: `/admin/users?q=${encodeURIComponent(authUser.user.email ?? "")}`,
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
