import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(()=> ({}));
  const { active, discount_percent, commission_percent } = body;

  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const u = Number(discount_percent ?? body.user_discount_pct ?? 0);
  const c = Number(commission_percent ?? body.commission_pct ?? 0);
  if (u < 0 || c < 0 || u > 100 || c > 100) {
    return NextResponse.json({ ok:false, error:"Percents must be 0..100" }, { status:400 });
  }

  // Per-influencer cap. Previously this endpoint enforced a hardcoded
  // 20% (inconsistent with the POST sibling which used 25), so an
  // influencer could create at 25 but couldn't edit past 20. Both now
  // read the same per-influencer value from influencer_profiles.
  let prof: { commission_cap_pct: number | null } | null;
  try {
    prof = await prisma.influencer_profiles.findUnique({
      where: { user_id: user.id },
      select: { commission_cap_pct: true },
    });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message }, { status:500 });
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

  // Ownership + GLOBAL-only scoping enforced in the WHERE (updateMany returns a
  // count, so a promo belonging to someone else simply matches 0 rows).
  const res = await prisma.promo_codes.updateMany({
    where: { id: params.id, influencer_id: user.id, product_id: null },
    data: {
      active: !!active,
      discount_percent: u,
      commission_percent: c,
      cap_percent: cap,
    },
  });
  if (res.count === 0) {
    return NextResponse.json({ ok:false, error:"Promo not found" }, { status:404 });
  }

  return NextResponse.json({ ok:true, id: params.id });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const res = await prisma.promo_codes.deleteMany({
    where: { id: params.id, influencer_id: user.id, product_id: null },
  });
  if (res.count === 0) {
    return NextResponse.json({ ok:false, error:"Promo not found" }, { status:404 });
  }

  return NextResponse.json({ ok:true });
}
