// app/api/auth/attach/route.ts
//
// Legacy Supabase → server-cookie bridge. Under AUTH_BACKEND=nextauth this is
// obsolete: NextAuth manages its own session cookie, so there is no Supabase
// session to attach. Kept as a safe no-op (returns { ok: true }) so the client
// callers that still POST here — /auth/login, /auth/register, /auth/callback,
// /influencer-request — don't error. Those callers only fire this when a
// Supabase session exists (which it never does under NextAuth) and ignore the
// response anyway, so returning ok:true unconditionally is safe.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ ok: true });
}
