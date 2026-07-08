import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Legacy Supabase OAuth code-exchange callback (was: exchangeCodeForSession).
// Under AUTH_BACKEND=nextauth, OAuth is handled by NextAuth's own
// /api/auth/callback/[provider] handler (the [...nextauth] catch-all), so this
// exact path (/api/auth/callback, no provider segment) is no longer part of any
// live flow. Kept as a safe redirect — no Supabase session exchange — rather
// than deleted, in case a stale provider/bookmark redirect still points here.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/account", url.origin));
}
