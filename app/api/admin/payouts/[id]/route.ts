export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d:any, s=200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin(_req);
  if (error) return error;
  const supabase = createAdminClient();

  const id = params.id;

  const body = await _req.json().catch(() => ({}));
  const status = String(body.status || "").toLowerCase();
  const settled_reference = body.settled_reference ?? null;
  const notes = body.notes ?? null;

  if (!["paid","failed","processing"].includes(status)) {
    return json({ ok:false, error:"Invalid status." }, 400);
  }

  const patch:any = { status, settled_reference, notes };
  if (status === "paid") patch.paid_at = new Date().toISOString();

  const { data, error: err } = await supabase
    .from("influencer_payouts")
    .update(patch)
    .eq("id", id)
    .select("id, amount, status, settled_reference, paid_at")
    .single();

  if (err) return json({ ok:false, error: err.message }, 400);

  // Mirror the admin payout status change into MySQL (the influencer
  // dashboard reads payouts from MySQL). Best-effort.
  try {
    const { mirrorPayoutIntoMysql } = await import("@/lib/data/influencer");
    await mirrorPayoutIntoMysql(supabase, id);
  } catch (e) {
    console.error("[dual-write] admin payout update MySQL mirror failed:", e);
  }

  return json({ ok:true, payout: data });
}
