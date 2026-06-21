import { NextResponse, type NextRequest } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    // Exchange the code for a session and set cookies
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.exchangeCodeForSession(code);
  }

  // redirect anywhere you like after auth completes
  return NextResponse.redirect(new URL("/debug/whoami", url.origin));
}
