export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/auth/routeUser";
import { supabaseForUser } from "@/lib/supabaseRoute";

// Influencer click/order timeseries for the dashboard chart.
//
// Why this exists: MetricsChart used to call `supabase.rpc("influencer_timeseries")`
// straight from the browser anon client. Under NextAuth `auth.uid()` is null, so the
// RPC (which scopes by the caller) returned empty. We move it server-side: the RPC
// signature is influencer_timeseries(p_from, p_to, p_user) — so we call it on the
// service-role client (`supabaseForUser`) and pass the logged-in influencer's id as
// p_user explicitly (no auth.uid() reliance, no `_as` wrapper needed).
export async function GET(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  const sb = supabaseForUser(user.id);
  const { data, error } = await sb.rpc("influencer_timeseries", {
    p_from: from,
    p_to: to,
    p_user: user.id,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, data: data ?? [] });
}
