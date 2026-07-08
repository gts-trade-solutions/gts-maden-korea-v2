export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d:any, s=200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin(_req);
  if (error) return error;

  const id = params.id;

  const body = await _req.json().catch(() => ({}));
  const status = String(body.status || "").toLowerCase();
  const settled_reference = body.settled_reference ?? null;
  const notes = body.notes ?? null;

  if (!["paid","failed","processing"].includes(status)) {
    return json({ ok:false, error:"Invalid status." }, 400);
  }

  const patch:any = { status, settled_reference, notes };
  if (status === "paid") patch.paid_at = new Date();

  try {
    const data = await prisma.influencer_payouts.update({
      where: { id },
      data: patch,
      select: { id: true, amount: true, status: true, settled_reference: true, paid_at: true },
    });
    return json({ ok:true, payout: jsonSafe(data) });
  } catch (err: any) {
    return json({ ok:false, error: err?.message || "UPDATE_FAILED" }, 400);
  }
}
