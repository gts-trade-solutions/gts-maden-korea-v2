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
import { createServiceClient } from "@/lib/supabaseServer";
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

  const sb = createServiceClient();

  // Pull the latest N notifications + the caller's read rows in parallel.
  const [notifsRes, readsRes] = await Promise.all([
    sb
      .from("admin_notifications")
      .select("id, type, title, body, link, severity, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    sb
      .from("admin_notification_reads")
      .select("notification_id")
      .eq("admin_id", user!.id),
  ]);

  if (notifsRes.error) return json({ ok: false, error: notifsRes.error.message }, 500);

  const readIds = new Set(
    (readsRes.data ?? []).map((r) => r.notification_id as string)
  );

  let items = (notifsRes.data ?? []).map((n) => ({
    ...n,
    read: readIds.has(n.id as string),
  }));
  if (unreadOnly) items = items.filter((i) => !i.read);

  // Compute total unread for the badge — does NOT use the same `limit`,
  // since the badge should reflect everything. Cap displayed value at
  // 99+ in the UI but return the real count.
  const { count: totalCount } = await sb
    .from("admin_notifications")
    .select("id", { count: "exact", head: true });
  const unreadCount = Math.max(0, (totalCount ?? 0) - readIds.size);

  return json({ ok: true, items, unread_count: unreadCount });
}
