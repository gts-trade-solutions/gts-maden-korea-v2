export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/adminGuard";

// PATCH /api/admin/influencers/payouts/[id] — update a payout. Admin-only
// (requireAdmin). Whitelisted fields only:
//   { status, paid_at, settled_reference }  — status change (client computes
//     paid_at + prompts for the settlement reference)
//   { notes }                               — note save
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({} as any));
  const patch: Record<string, any> = {};

  if (typeof body.status === "string") patch.status = body.status;
  if (body.paid_at !== undefined) patch.paid_at = body.paid_at ? new Date(body.paid_at) : null; // ISO string or null
  if (typeof body.settled_reference === "string") {
    const t = body.settled_reference.trim();
    if (t) patch.settled_reference = t;
  }
  if (typeof body.notes === "string") patch.notes = body.notes;

  if (!Object.keys(patch).length) return json({ ok: false, error: "NO_FIELDS" }, 400);

  try {
    await prisma.influencer_payouts.updateMany({ where: { id: params.id }, data: patch });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "UPDATE_FAILED" }, 500);
  }

  return json({ ok: true });
}
