export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// GET /api/admin/influencers/payouts — payouts + influencer name/handle. Admin-only
// (requireAdmin) + service-role. Emails added client-side via /api/admin/users/lookup.
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
  const { data: payouts, error: pErr } = await sb
    .from("influencer_payouts")
    .select(
      "id, influencer_id, amount, currency, status, notes, created_at, paid_at, covering_orders, settled_reference"
    )
    .order("created_at", { ascending: false });
  if (pErr) return json({ ok: false, error: pErr.message }, 500);

  const ids = Array.from(new Set((payouts ?? []).map((p) => p.influencer_id).filter(Boolean)));
  let profiles: any[] = [];
  let influencerProfiles: any[] = [];
  if (ids.length) {
    const [pr, ip] = await Promise.all([
      sb.from("profiles").select("id, full_name").in("id", ids),
      sb.from("influencer_profiles").select("user_id, handle").in("user_id", ids),
    ]);
    profiles = pr.data ?? [];
    influencerProfiles = ip.data ?? [];
  }

  return json({ ok: true, payouts: payouts ?? [], profiles, influencerProfiles });
}
