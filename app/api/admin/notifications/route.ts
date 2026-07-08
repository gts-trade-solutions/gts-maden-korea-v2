// GET /api/admin/notifications
//
// Query params:
//   unread_only=1 — return only items the caller hasn't read yet
//   limit         — clamp 1..100, default 50
//
// Response:
//   {
//     ok: true,
//     items: [{ id, type, title, body, link, severity, meta,
//               created_at, read: boolean }],
//     unread_count: number   // total unread for this admin (cap 99+)
//   }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread_only") === "1";
  const limit = Math.min(
    100,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 50))
  );

  try {
    // Pull the latest N notifications + the caller's read rows in parallel.
    const [notifs, reads] = await Promise.all([
      prisma.admin_notifications.findMany({
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          link: true,
          severity: true,
          meta: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
        take: limit,
      }),
      prisma.admin_notification_reads.findMany({
        select: { notification_id: true },
        where: { admin_id: user!.id },
      }),
    ]);

    const readIds = new Set(reads.map((r) => r.notification_id as string));

    let items = notifs.map((n) => ({
      ...n,
      read: readIds.has(n.id as string),
    }));
    if (unreadOnly) items = items.filter((i) => !i.read);

    // Compute total unread for the badge — does NOT use the same `limit`,
    // since the badge should reflect everything. Cap displayed value at
    // 99+ in the UI but return the real count.
    const totalCount = await prisma.admin_notifications.count();
    const unreadCount = Math.max(0, (totalCount ?? 0) - readIds.size);

    return json({ ok: true, items: jsonSafe(items), unread_count: unreadCount });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
}
