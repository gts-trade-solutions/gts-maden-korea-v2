import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { supabaseForUser } from "@/lib/supabaseRoute";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(()=> ({}));
  const { active, discount_percent, commission_percent } = body;

  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  // NextAuth has no Supabase session — the RLS-gated profile read + promo_codes
  // update + mirror need a service-role client scoped by user.id.
  const sb = supabaseForUser(user.id);

  const u = Number(discount_percent ?? body.user_discount_pct ?? 0);
  const c = Number(commission_percent ?? body.commission_pct ?? 0);
  if (u < 0 || c < 0 || u > 100 || c > 100) {
    return NextResponse.json({ ok:false, error:"Percents must be 0..100" }, { status:400 });
  }

  // Per-influencer cap. Previously this endpoint enforced a hardcoded
  // 20% (inconsistent with the POST sibling which used 25), so an
  // influencer could create at 25 but couldn't edit past 20. Both now
  // read the same per-influencer value from influencer_profiles.
  const { data: prof, error: profErr } = await sb
    .from("influencer_profiles")
    .select("commission_cap_pct")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profErr) {
    return NextResponse.json({ ok:false, error: profErr.message }, { status:500 });
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

  const { data, error } = await sb
    .from("promo_codes")
    .update({
      active: !!active,
      discount_percent: u,
      commission_percent: c,
      cap_percent: cap,
    })
    .eq("id", params.id)
    .eq("influencer_id", user.id)
    .is("product_id", null) // GLOBAL only
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });

  try {
    const { mirrorPromoIntoMysql } = await import("@/lib/data/influencer");
    await mirrorPromoIntoMysql(sb, params.id);
  } catch (e) {
    console.error("[dual-write] promo edit MySQL mirror failed:", e);
  }

  return NextResponse.json({ ok:true, id:data.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  // NextAuth has no Supabase session — without a service-role client the delete
  // affects 0 rows under RLS (no error) while the MySQL delete still runs, so a
  // "deleted" promo stays live at checkout. Scope by user.id.
  const sb = supabaseForUser(user.id);

  const { error } = await sb
    .from("promo_codes")
    .delete()
    .eq("id", params.id)
    .eq("influencer_id", user.id)
    .is("product_id", null);

  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });

  try {
    const { deletePromoFromMysql } = await import("@/lib/data/influencer");
    await deletePromoFromMysql(params.id);
  } catch (e) {
    console.error("[dual-write] promo delete MySQL mirror failed:", e);
  }

  return NextResponse.json({ ok:true });
}
