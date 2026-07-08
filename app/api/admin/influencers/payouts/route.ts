export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// GET /api/admin/influencers/payouts — payouts + influencer name/handle. Admin-only
// (requireAdmin). Emails added client-side via /api/admin/users/lookup.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const payouts = await prisma.influencer_payouts.findMany({
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      influencer_id: true,
      amount: true,
      currency: true,
      status: true,
      notes: true,
      created_at: true,
      paid_at: true,
      covering_orders: true,
      settled_reference: true,
    },
  });

  const ids = Array.from(new Set(payouts.map((p) => p.influencer_id).filter(Boolean)));
  let profiles: any[] = [];
  let influencerProfiles: any[] = [];
  if (ids.length) {
    const [pr, ip] = await Promise.all([
      prisma.profiles.findMany({
        where: { id: { in: ids } },
        select: { id: true, full_name: true },
      }),
      prisma.influencer_profiles.findMany({
        where: { user_id: { in: ids } },
        select: { user_id: true, handle: true },
      }),
    ]);
    profiles = pr;
    influencerProfiles = ip;
  }

  return json({
    ok: true,
    payouts: jsonSafe(payouts),
    profiles: jsonSafe(profiles),
    influencerProfiles: jsonSafe(influencerProfiles),
  });
}
