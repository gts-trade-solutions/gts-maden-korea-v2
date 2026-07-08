export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
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

  const data = await prisma.influencer_profiles.findUnique({
    where: { user_id: params.user_id },
    select: {
      user_id: true,
      handle: true,
      active: true,
      commission_cap_pct: true,
      default_user_discount_pct: true,
      applicable_countries: true,
    },
  });
  if (!data) return json({ ok: false, error: "NOT_FOUND" }, 404);

  return json({ ok: true, influencer: jsonSafe(data) });
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
    updated_at: new Date(),
  };
  if (regions !== undefined) {
    updatePayload.applicable_countries = regions;
  }

  try {
    const data = await prisma.influencer_profiles.update({
      where: { user_id: params.user_id },
      data: updatePayload,
      select: {
        user_id: true,
        commission_cap_pct: true,
        default_user_discount_pct: true,
        applicable_countries: true,
      },
    });
    return json({ ok: true, influencer: jsonSafe(data) });
  } catch (e: any) {
    if (e?.code === "P2025") return json({ ok: false, error: "NOT_FOUND" }, 404);
    return json({ ok: false, error: e?.message || "UPDATE_FAILED" }, 500);
  }
}
