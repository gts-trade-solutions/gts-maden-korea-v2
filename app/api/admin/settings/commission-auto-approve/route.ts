export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin GET/PATCH for the K-Partnership commission auto-approve window.
//   0 → approve immediately on payment verification.
//   N → leave 'pending' until /api/cron/commission-approve sees that
//       `now > paid_at + N days` and flips it.
// Lives on store_settings.commission_auto_approve_days. Cap at 90 to
// stop a typo (e.g. 9000) from never approving anything.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const MIN = 0;
const MAX = 90;

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  let data;
  try {
    data = await prisma.store_settings.findFirst({
      select: { commission_auto_approve_days: true },
    });
  } catch (dbErr: any) {
    return json({ ok: false, error: dbErr?.message ?? "Read failed" }, 500);
  }
  return json(
    jsonSafe({
      ok: true,
      days: Number(data?.commission_auto_approve_days ?? 0),
      bounds: { min: MIN, max: MAX },
    })
  );
}

export async function PATCH(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const raw = Number(body.days);
  if (!Number.isFinite(raw) || raw < MIN || raw > MAX) {
    return json(
      { ok: false, error: `Days must be an integer ${MIN}..${MAX}` },
      400
    );
  }
  const value = Math.floor(raw);

  try {
    await prisma.store_settings.update({
      where: { id: 1 },
      data: {
        commission_auto_approve_days: value,
        updated_at: new Date(),
        updated_by: user!.id,
      },
    });
  } catch (upErr: any) {
    return json({ ok: false, error: upErr?.message ?? "Update failed" }, 500);
  }

  return json({ ok: true, days: value });
}
