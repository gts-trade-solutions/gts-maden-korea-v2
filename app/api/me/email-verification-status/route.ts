// GET /api/me/email-verification-status
//
// Returns the signed-in user's verification status (stage, deadline,
// days remaining). Anon callers get { authenticated: false } so the
// banner can render nothing without erroring.

import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/auth/routeUser";
import { getEmailVerificationStatus } from "@/lib/auth/emailVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = (await getRouteUser())?.id ?? null;
  if (!userId) {
    return NextResponse.json({ authenticated: false });
  }

  const status = await getEmailVerificationStatus(userId);
  return NextResponse.json({
    authenticated: true,
    ...status,
  });
}
