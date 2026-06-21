import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { supabaseForUser } from "@/lib/supabaseRoute";

// Per-influencer cap lives on influencer_profiles.commission_cap_pct
// (admin-managed via /admin/influencers). No global constant any more.

export async function GET(req: NextRequest) {
  const { user } = await getRouteAuth(req);
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );

  if (process.env.CATALOG_BACKEND === "mysql") {
    try {
      const { getGlobalPromosMysql } = await import("@/lib/data/influencer");
      return NextResponse.json({ ok: true, promos: await getGlobalPromosMysql(user.id) });
    } catch (e) {
      console.error("[influencer/promos] MySQL read failed, falling back to Supabase:", e);
    }
  }

  // Supabase fallback — RLS-gated, so use a service-role client scoped by user.id.
  const sb = supabaseForUser(user.id);
  const { data, error } = await sb
    .from("promo_codes")
    .select(
      "id, code, product_id, active, discount_percent, commission_percent, uses, max_uses"
    )
    .eq("influencer_id", user.id)
    .is("product_id", null) // GLOBAL only
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  return NextResponse.json({ ok: true, promos: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { code, discount_percent, commission_percent } = body;

  const { user } = await getRouteAuth(req);
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );

  // Under NextAuth there is no Supabase session; the influencer_profiles read
  // and the promo_codes insert are RLS-gated, so run them on a service-role
  // client scoped explicitly by user.id.
  const sb = supabaseForUser(user.id);

  const u = Number(discount_percent ?? body.user_discount_pct ?? 0);
  const c = Number(commission_percent ?? body.commission_pct ?? 0);
  if (!code || !String(code).trim()) {
    return NextResponse.json(
      { ok: false, error: "Code required" },
      { status: 400 }
    );
  }
  if (u < 0 || c < 0 || u > 100 || c > 100) {
    return NextResponse.json(
      { ok: false, error: "Percents must be 0..100" },
      { status: 400 }
    );
  }

  // Look up this influencer's per-account cap. Admin sets this at
  // approval time and can revise it from /admin/influencers. If the
  // row is missing (caller isn't actually an approved influencer), we
  // fail loudly rather than fall back to a constant — the previous
  // hardcoded 25% was masking this case.
  const { data: prof, error: profErr } = await sb
    .from("influencer_profiles")
    .select("commission_cap_pct")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profErr) {
    return NextResponse.json(
      { ok: false, error: profErr.message },
      { status: 500 }
    );
  }
  if (!prof || prof.commission_cap_pct == null) {
    // Stable error code — client maps to a translated string. Plain
    // English `error` kept as a fallback for non-localised callers.
    return NextResponse.json(
      {
        ok: false,
        code: "SETTINGS_NOT_FINALIZED",
        error: "Your commission settings haven't been finalized yet. Contact admin.",
      },
      { status: 400 }
    );
  }
  const cap = Number(prof.commission_cap_pct);
  if (u + c > cap + 0.0001) {
    return NextResponse.json(
      {
        ok: false,
        code: "SPLIT_EXCEEDS_CAP",
        cap,
        error: `Customer% + You% must be ≤ ${cap}`,
      },
      { status: 400 }
    );
  }

  const payload = {
    influencer_id: user.id,
    code: String(code).toUpperCase(),
    product_id: null, // GLOBAL
    discount_percent: u,
    commission_percent: c,
    cap_percent: cap, // per-influencer cap snapshotted at creation
    active: true,
  };

  const { data, error } = await sb
    .from("promo_codes")
    .insert(payload)
    .select("id, code")
    .single();

  if (error) {
    // Postgres 23505 = unique_violation. The promo_codes_code_key
    // index makes `code` globally unique across influencers, so two
    // influencers can never own the same code — first-come, first-
    // served on the string namespace. Surface a friendly error code
    // so the dashboard can translate it instead of dumping the raw
    // "duplicate key value violates unique constraint" text.
    if ((error as any).code === "23505") {
      return NextResponse.json(
        {
          ok: false,
          code: "CODE_ALREADY_TAKEN",
          error: "CODE_ALREADY_TAKEN",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 }
    );
  }

  // Mirror the new promo into MySQL so it works at checkout + shows on the
  // (MySQL-backed) dashboard. Best-effort — never fail the create.
  try {
    const { mirrorPromoIntoMysql } = await import("@/lib/data/influencer");
    await mirrorPromoIntoMysql(sb, data.id);
  } catch (e) {
    console.error("[dual-write] promo create MySQL mirror failed:", e);
  }

  return NextResponse.json({ ok: true, promo: data });
}
