// POST /api/auth/welcome-email
//
// Fires the welcome email to the signed-in user. Called from the
// register flow right after signup, alongside the verification email.
// Auth required — we use the session's email + profile's name and
// locale so the message is personalised.
//
// Best-effort: never errors out for missing locale / name / trending
// products. The verification flow is the real account gate; this is
// soft promotional content.

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getRouteUser } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";
import { sendWelcomeEmail } from "@/lib/auth/sendWelcomeEmail";
import { createAdminNotification } from "@/lib/admin/notifications";

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

    // Canonical email lives in the NextAuth user row.
    const authUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!authUser?.email) {
      return NextResponse.json(
        { ok: false, reason: "no_email" },
        { status: 400 }
      );
    }
    const userEmail = authUser.email;

    const profile = await prisma.profiles.findUnique({
      where: { id: userId },
      select: {
        full_name: true,
        preferred_locale: true,
        preferred_country: true,
      },
    });

    const locale =
      (profile?.preferred_locale as string | null) ||
      cookies().get("mik_locale")?.value ||
      null;
    const country =
      (profile?.preferred_country as string | null) ||
      cookies().get("mik_country")?.value ||
      null;

    await sendWelcomeEmail({
      email: userEmail,
      name: (profile?.full_name as string | null) ?? null,
      locale,
      country,
      origin: req.nextUrl.origin,
    });

    // Admin bell notification. This route fires once per signup right
    // after the auth row is created (the register flow calls it from
    // the success path), so it's the right place to emit the "new user"
    // alert. Vendor-role accounts are notified separately by the vendor
    // signup flow (see app/vendor/(public)/register/...).
    void createAdminNotification({
      type: "user_signed_up",
      title: `New customer signed up — ${userEmail}`,
      body: ((profile?.full_name as string | null) ?? "").trim() || null,
      link: `/admin/users?q=${encodeURIComponent(userEmail)}`,
      severity: "info",
      meta: { user_id: userId, country: country ?? null },
      createdBy: userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[welcome-email] unexpected error:", err);
    return NextResponse.json(
      { ok: false, reason: "internal_error" },
      { status: 500 }
    );
  }
}
