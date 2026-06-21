// app/api/auth/attach/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  const { access_token, refresh_token } = await req.json().catch(() => ({}));
  if (!access_token || !refresh_token) {
    return NextResponse.json({ ok: false, error: "MISSING_TOKENS" }, { status: 400 });
  }
  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
