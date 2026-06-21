// POST /api/auth/verify-email
//
// Body: { token: string }
// Consumes the raw verification token. On success, marks the owning user
// as verified (`profiles.email_verified_at = now()`).
//
// Token errors (not_found, expired, used) all return 400 with a short
// reason — the landing page surfaces a tailored message + "resend" CTA.

import { NextRequest, NextResponse } from "next/server";
import {
  consumeVerificationToken,
  markUserVerified,
} from "@/lib/auth/emailVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();

    if (!token) {
      return NextResponse.json(
        { ok: false, reason: "missing_token" },
        { status: 400 }
      );
    }

    const result = await consumeVerificationToken(token);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, reason: result.reason },
        { status: 400 }
      );
    }

    await markUserVerified(result.userId);

    return NextResponse.json({
      ok: true,
      email: result.email,
    });
  } catch (err) {
    console.error("[verify-email] unexpected error:", err);
    return NextResponse.json(
      { ok: false, reason: "internal_error" },
      { status: 500 }
    );
  }
}
