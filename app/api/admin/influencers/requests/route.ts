export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// GET /api/admin/influencers/requests — influencer requests + the requesters'
// profiles. Admin-only (requireAdmin). Emails are added client-side via
// /api/admin/users/lookup (already cookie-auth).
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const requests = await prisma.influencer_requests.findMany({
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      user_id: true,
      handle: true,
      note: true,
      social: true,
      status: true,
      created_at: true,
    },
  });

  const ids = Array.from(new Set(requests.map((r) => r.user_id).filter(Boolean)));
  let profiles: any[] = [];
  if (ids.length) {
    profiles = await prisma.profiles.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        full_name: true,
        role: true,
        phone: true,
        avatar_url: true,
        created_at: true,
      },
    });
  }

  return json({ ok: true, requests: jsonSafe(requests), profiles: jsonSafe(profiles) });
}
