// POST /api/auth/verify-email/resend
//
// Fires a fresh verification email to the signed-in user's address.
// Requires an authenticated session — anon callers get 401. The
// `canResendVerification` rate-limit (1 token per 60s per user)
// guards against pump-the-SES-bill abuse.

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getRouteUser } from "@/lib/auth/routeUser";
import { createServiceClient } from "@/lib/supabaseServer";
import { canResendVerification } from "@/lib/auth/emailVerification";
import { sendVerificationEmail } from "@/lib/auth/sendVerificationEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = (await getRouteUser(req))?.id ?? null;
    if (!userId) {
      return NextResponse.json(
        { ok: false, reason: "unauthenticated" },
        { status: 401 }
      );
    }

    // Service-role lookup for the canonical email + already-verified state.
    const admin = createServiceClient();
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    if (!authUser?.user?.email) {
      return NextResponse.json(
        { ok: false, reason: "no_email" },
        { status: 400 }
      );
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("email_verified_at, preferred_locale")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.email_verified_at) {
      return NextResponse.json({
        ok: true,
        alreadyVerified: true,
      });
    }

    const allowed = await canResendVerification(userId, 60);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, reason: "rate_limited", message: "Please wait a minute before requesting another email." },
        { status: 429 }
      );
    }

    const locale =
      (profile?.preferred_locale as string | null) ||
      cookies().get("mik_locale")?.value ||
      null;

    await sendVerificationEmail({
      userId,
      email: authUser.user.email,
      locale,
      origin: req.nextUrl.origin,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[verify-email/resend] unexpected error:", err);
    return NextResponse.json(
      { ok: false, reason: "internal_error" },
      { status: 500 }
    );
  }
}
