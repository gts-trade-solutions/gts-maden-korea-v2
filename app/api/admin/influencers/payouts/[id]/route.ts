export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// PATCH /api/admin/influencers/payouts/[id] — update a payout. Admin-only
// (requireAdmin) + service-role. Whitelisted fields only:
//   { status, paid_at, settled_reference }  — status change (client computes
//     paid_at + prompts for the settlement reference)
//   { notes }                               — note save
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({} as any));
  const patch: Record<string, any> = {};

  if (typeof body.status === "string") patch.status = body.status;
  if (body.paid_at !== undefined) patch.paid_at = body.paid_at; // ISO string or null
  if (typeof body.settled_reference === "string") {
    const t = body.settled_reference.trim();
    if (t) patch.settled_reference = t;
  }
  if (typeof body.notes === "string") patch.notes = body.notes;

  if (!Object.keys(patch).length) return json({ ok: false, error: "NO_FIELDS" }, 400);

  const sb = admin();
  const { error: e } = await sb.from("influencer_payouts").update(patch).eq("id", params.id);
  if (e) return json({ ok: false, error: e.message }, 500);

  // Dual-write: mirror the payout into MySQL (the influencer dashboard reads
  // payouts from MySQL). Best-effort.
  try {
    const { mirrorPayoutIntoMysql } = await import("@/lib/data/influencer");
    await mirrorPayoutIntoMysql(sb, params.id);
  } catch (err) {
    console.error("[dual-write] payout PATCH MySQL mirror failed:", err);
  }

  return json({ ok: true });
}
