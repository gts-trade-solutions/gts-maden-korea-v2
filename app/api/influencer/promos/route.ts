import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Per-influencer cap lives on influencer_profiles.commission_cap_pct
// (admin-managed via /admin/influencers). No global constant any more.

export async function GET(req: NextRequest) {
  const { user } = await getRouteAuth(req);
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );

  const { getGlobalPromosMysql } = await import("@/lib/data/influencer");
  return NextResponse.json({ ok: true, promos: await getGlobalPromosMysql(user.id) });
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
  let prof: { commission_cap_pct: number | null } | null;
  try {
    prof = await prisma.influencer_profiles.findUnique({
      where: { user_id: user.id },
      select: { commission_cap_pct: true },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
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

  try {
    const created = await prisma.promo_codes.create({
      data: {
        id: randomUUID(),
        influencer_id: user.id,
        code: String(code).toUpperCase(),
        product_id: null, // GLOBAL
        discount_percent: u,
        commission_percent: c,
        cap_percent: cap, // per-influencer cap snapshotted at creation
        active: true,
      },
      select: { id: true, code: true },
    });
    return NextResponse.json({ ok: true, promo: jsonSafe(created) });
  } catch (e: any) {
    // P2002 = unique constraint violation. `promo_codes.code` is globally
    // unique across influencers, so two influencers can never own the same
    // code — first-come, first-served on the string namespace. Surface a
    // friendly error code so the dashboard can translate it instead of
    // dumping the raw constraint text.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
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
      { ok: false, error: e?.message || "CREATE_FAILED" },
      { status: 400 }
    );
  }
}
