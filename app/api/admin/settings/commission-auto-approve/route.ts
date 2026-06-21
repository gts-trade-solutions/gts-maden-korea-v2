export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin GET/PATCH for the K-Partnership commission auto-approve window.
//   0 → approve immediately on payment verification.
//   N → leave 'pending' until /api/cron/commission-approve sees that
//       `now > paid_at + N days` and flips it.
// Lives on store_settings.commission_auto_approve_days. Cap at 90 to
// stop a typo (e.g. 9000) from never approving anything.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const MIN = 0;
const MAX = 90;

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = admin();
  const { data, error: dbErr } = await sb
    .from("store_settings")
    .select("commission_auto_approve_days")
    .eq("id", 1)
    .maybeSingle();
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);
  return json({
    ok: true,
    days: Number(data?.commission_auto_approve_days ?? 0),
    bounds: { min: MIN, max: MAX },
  });
}

export async function PATCH(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const raw = Number(body.days);
  if (!Number.isFinite(raw) || raw < MIN || raw > MAX) {
    return json(
      { ok: false, error: `Days must be an integer ${MIN}..${MAX}` },
      400
    );
  }
  const value = Math.floor(raw);

  const sb = admin();
  const { error: upErr } = await sb
    .from("store_settings")
    .update({
      commission_auto_approve_days: value,
      updated_at: new Date().toISOString(),
      updated_by: user!.id,
    })
    .eq("id", 1);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  return json({ ok: true, days: value });
}
