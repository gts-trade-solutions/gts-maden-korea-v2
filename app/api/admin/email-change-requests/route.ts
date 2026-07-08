// GET /api/admin/email-change-requests?status=pending
//
// Lists email change requests. Defaults to pending; pass status=all to
// see all statuses. Admin only.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "pending").toLowerCase();

  let data;
  try {
    data = await prisma.email_change_requests.findMany({
      where: status !== "all" ? { status } : undefined,
      select: {
        id: true,
        user_id: true,
        current_email: true,
        requested_email: true,
        status: true,
        reason: true,
        admin_note: true,
        requested_at: true,
        processed_at: true,
      },
      orderBy: { requested_at: "desc" },
      take: 200,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? "query_failed" }, 500);
  }

  // Decorate with the requester's name for the admin UI.
  const ids = Array.from(new Set(data.map((r) => r.user_id as string)));
  const nameMap = new Map<string, string | null>();
  if (ids.length > 0) {
    const profs = await prisma.profiles.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true },
    });
    for (const p of profs) {
      nameMap.set(p.id as string, (p.full_name as string | null) ?? null);
    }
  }

  return json(
    jsonSafe({
      ok: true,
      rows: data.map((r) => ({
        ...r,
        requester_name: nameMap.get(r.user_id as string) ?? null,
      })),
    })
  );
}
