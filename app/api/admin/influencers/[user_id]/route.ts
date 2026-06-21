export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSupportedCountry } from "@/lib/countries";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only per-influencer settings editor. Currently exposes the
// commission cap + default user-discount split — both whole-percent
// fields backed by influencer_profiles. Used by:
//   - the admin approval modal on /admin/influencers to seed values
//     for newly-approved creators (via approve_influencer RPC, not
//     this endpoint),
//   - the inline editor on the same page to revise an existing
//     influencer's cap after approval.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });


function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// Whole-percent only; DB enforces these but we surface friendly
// errors here before hitting the constraint.
const CAP_MIN = 5;
const CAP_MAX = 100;

function validatePair(cap: any, def: any): { ok: true; cap: number; def: number } | { ok: false; error: string } {
  const c = Number(cap);
  const d = Number(def);
  if (!Number.isFinite(c) || !Number.isInteger(c) || c < CAP_MIN || c > CAP_MAX) {
    return { ok: false, error: `commission_cap_pct must be an integer ${CAP_MIN}..${CAP_MAX}` };
  }
  if (!Number.isFinite(d) || !Number.isInteger(d) || d < 0 || d > c) {
    return { ok: false, error: `default_user_discount_pct must be an integer 0..${c}` };
  }
  return { ok: true, cap: c, def: d };
}

export async function GET(
  _req: Request,
  { params }: { params: { user_id: string } }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = admin();
  const { data, error: dbErr } = await sb
    .from("influencer_profiles")
    .select(
      "user_id, handle, active, commission_cap_pct, default_user_discount_pct, applicable_countries"
    )
    .eq("user_id", params.user_id)
    .maybeSingle();
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);
  if (!data) return json({ ok: false, error: "NOT_FOUND" }, 404);

  return json({ ok: true, influencer: data });
}

export async function PATCH(
  req: Request,
  { params }: { params: { user_id: string } }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const v = validatePair(body.commission_cap_pct, body.default_user_discount_pct);
  if (!v.ok) return json({ ok: false, error: v.error }, 400);

  // applicable_countries: optional. When present must be an array of
  // ISO codes from our supported set — drop anything that doesn't
  // validate so a typo in one entry doesn't reject the whole payload.
  // Empty array stays empty = applies in all supported countries.
  let regions: string[] | undefined;
  if (Array.isArray(body.applicable_countries)) {
    const cleaned = body.applicable_countries
      .map((c: any) => String(c || "").toUpperCase().trim())
      .filter((c: string) => isSupportedCountry(c));
    // Dedup
    regions = Array.from(new Set(cleaned));
  }

  const updatePayload: Record<string, any> = {
    commission_cap_pct: v.cap,
    default_user_discount_pct: v.def,
    updated_at: new Date().toISOString(),
  };
  if (regions !== undefined) {
    updatePayload.applicable_countries = regions;
  }

  const sb = admin();
  const { data, error: upErr } = await sb
    .from("influencer_profiles")
    .update(updatePayload)
    .eq("user_id", params.user_id)
    .select(
      "user_id, commission_cap_pct, default_user_discount_pct, applicable_countries"
    )
    .maybeSingle();
  if (upErr) return json({ ok: false, error: upErr.message }, 500);
  if (!data) return json({ ok: false, error: "NOT_FOUND" }, 404);

  // Dual-write: mirror the influencer profile into MySQL (the influencer
  // dashboard + commission caps read cap/discount/countries from MySQL).
  try {
    const { mirrorInfluencerProfileIntoMysql } = await import("@/lib/data/influencer");
    await mirrorInfluencerProfileIntoMysql(sb, params.user_id);
  } catch (e) {
    console.error("[dual-write] influencer settings MySQL mirror failed:", e);
  }

  return json({ ok: true, influencer: data });
}
