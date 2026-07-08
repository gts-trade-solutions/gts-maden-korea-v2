// POST /api/admin/notifications/read-all
//
// Marks every existing notification read for the calling admin. Bulk-inserts
// into admin_notification_reads, skipping rows already marked.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST() {
  const { user, error } = await requireAdmin();
  if (error) return error;

  try {
    // Get every notification id and bulk-insert a read row for the
    // calling admin. Cap to recent 500 to avoid runaway lists.
    const notifs = await prisma.admin_notifications.findMany({
      select: { id: true },
      orderBy: { created_at: "desc" },
      take: 500,
    });

    if (!notifs || notifs.length === 0) return json({ ok: true, marked: 0 });

    const rows = notifs.map((n) => ({
      notification_id: n.id as string,
      admin_id: user!.id,
    }));
    await prisma.admin_notification_reads.createMany({
      data: rows,
      skipDuplicates: true,
    });

    return json({ ok: true, marked: rows.length });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
}
