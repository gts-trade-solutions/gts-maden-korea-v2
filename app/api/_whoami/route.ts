

import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const h = headers();
  const auth = h.get("authorization");

  // Try Bearer
  let via_bearer = false, bearer_id: string | null = null;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) { via_bearer = true; bearer_id = data.user.id; }
  }

  // Try cookie
  const { data: cookieData } = await supabase.auth.getUser();
  const via_cookie = !!cookieData.user;
  const cookie_id = cookieData.user?.id ?? null;

  return NextResponse.json(
    { ok: true, via_bearer, via_cookie, user_id: bearer_id ?? cookie_id },
    { headers: { "cache-control": "no-store" } }
  );
}
