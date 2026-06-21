// POST /api/admin/notifications/[id]/read
//
// Marks one notification read for the calling admin. Idempotent —
// re-firing just no-ops via the unique (notification_id, admin_id) PK.
// DELETE on the same path un-marks (lets the UI offer "mark unread").

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  const supabase = createServiceClient();
  if (!params.id) return json({ ok: false, error: "missing_id" }, 400);

  // RLS permits the caller to write only their own read row.
  const { error: insErr } = await supabase
    .from("admin_notification_reads")
    .upsert(
      { notification_id: params.id, admin_id: user!.id },
      { onConflict: "notification_id,admin_id", ignoreDuplicates: true }
    );
  if (insErr) return json({ ok: false, error: insErr.message }, 500);
  return json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin();
  if (error) return error;
  const supabase = createServiceClient();
  if (!params.id) return json({ ok: false, error: "missing_id" }, 400);

  const { error: delErr } = await supabase
    .from("admin_notification_reads")
    .delete()
    .eq("notification_id", params.id)
    .eq("admin_id", user!.id);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);
  return json({ ok: true });
}
