export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin: international order requests list. The browser anon Supabase client
// returns 0 rows under NextAuth (RLS), so this reads via the SERVICE-ROLE
// client. Mirrors the page's exact select/order/limit so the page renders
// unchanged. Admin-gated.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const sb = admin();
  const { data, error: e } = await sb
    .from("international_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (e) return json({ ok: false, error: e.message }, 500);
  return json({ ok: true, data: data ?? [] });
}
