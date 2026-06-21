// POST /api/admin/notifications/read-all
//
// Marks every existing notification read for the calling admin. Uses
// service-role to bulk-upsert into admin_notification_reads.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST() {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const sb = createServiceClient();

  // Get every notification id and bulk-upsert a read row for the
  // calling admin. Cap to recent 500 to avoid runaway lists.
  const { data: notifs, error: nErr } = await sb
    .from("admin_notifications")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (nErr) return json({ ok: false, error: nErr.message }, 500);

  if (!notifs || notifs.length === 0) return json({ ok: true, marked: 0 });

  const rows = notifs.map((n) => ({
    notification_id: n.id as string,
    admin_id: user!.id,
  }));
  const { error: upErr } = await sb
    .from("admin_notification_reads")
    .upsert(rows, {
      onConflict: "notification_id,admin_id",
      ignoreDuplicates: true,
    });
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  return json({ ok: true, marked: rows.length });
}
