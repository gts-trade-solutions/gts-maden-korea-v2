export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin SERVICE-ROLE read for the campaign dropdown on /admin/instagram/posts.
// The browser anon Supabase client gets 0 rows from `campaigns` under RLS once
// NextAuth is the auth backend, so the dropdown was empty. Route it through the
// service-role client behind requireAdmin instead.
const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const sb = admin();
  const { data, error: e } = await sb
    .from("campaigns")
    .select("id, name")
    .order("created_at", { ascending: false });
  if (e) return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  return NextResponse.json({ ok: true, data }, { headers: { "cache-control": "no-store" } });
}
