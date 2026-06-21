// app/api/debug/whoami/route.ts
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { headers, cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const h = headers();
  const auth = h.get("authorization");

  let bearerUser: any = null;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error) bearerUser = data.user;
  }
  const { data: cookieData } = await supabase.auth.getUser();
  const cookieUser = cookieData.user;

  return NextResponse.json({
    ok: true,
    via_bearer: !!bearerUser,
    via_cookie: !!cookieUser,
    user_id: bearerUser?.id ?? cookieUser?.id ?? null,
  }, { headers: { "cache-control": "no-store" } });
}
