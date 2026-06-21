export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// GET /api/admin/influencers/requests — influencer requests + the requesters'
// profiles. Admin-only (requireAdmin) + service-role data. Emails are added
// client-side via /api/admin/users/lookup (already cookie-auth).
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = admin();
  const { data: requests, error: rErr } = await sb
    .from("influencer_requests")
    .select("id, user_id, handle, note, social, status, created_at")
    .order("created_at", { ascending: false });
  if (rErr) return json({ ok: false, error: rErr.message }, 500);

  const ids = Array.from(new Set((requests ?? []).map((r) => r.user_id).filter(Boolean)));
  let profiles: any[] = [];
  if (ids.length) {
    const { data } = await sb
      .from("profiles")
      .select("id, full_name, role, phone, avatar_url, created_at")
      .in("id", ids);
    profiles = data ?? [];
  }

  return json({ ok: true, requests: requests ?? [], profiles });
}
