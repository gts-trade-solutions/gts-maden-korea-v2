export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { mirrorTableToMysql } from "@/lib/data/mirror";

// POST /api/admin/mysql-mirror  { table, scopeVal? }
//
// Dual-write mirror for browser-direct admin/CMS writes that have no server
// boundary. The CMS page keeps its existing Supabase write, then fires this
// (best-effort, via lib/admin/mirror-mysql#mirrorMysql) to re-sync that table or
// product scope into MySQL — the storefront read source.
export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({} as any));
  const r = await mirrorTableToMysql(String(body?.table || ""), body?.scopeVal);
  return NextResponse.json(
    { ok: r.ok, table: body?.table, synced: r.synced, error: r.error },
    { status: r.ok ? 200 : r.status ?? 500, headers: { "cache-control": "no-store" } }
  );
}
