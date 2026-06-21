// GET /api/admin/email-change-requests?status=pending
//
// Lists email change requests. Defaults to pending; pass status=all to
// see all statuses. Admin only.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "pending").toLowerCase();
  const sb = createServiceClient();

  let q = sb
    .from("email_change_requests")
    .select(
      "id, user_id, current_email, requested_email, status, reason, admin_note, requested_at, processed_at"
    )
    .order("requested_at", { ascending: false })
    .limit(200);
  if (status !== "all") q = q.eq("status", status);

  const { data, error: qErr } = await q;
  if (qErr) return json({ ok: false, error: qErr.message }, 500);

  // Decorate with the requester's name for the admin UI.
  const ids = Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
  const nameMap = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: profs } = await sb
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of profs ?? []) {
      nameMap.set(p.id as string, (p.full_name as string | null) ?? null);
    }
  }

  return json({
    ok: true,
    rows: (data ?? []).map((r) => ({
      ...r,
      requester_name: nameMap.get(r.user_id as string) ?? null,
    })),
  });
}
