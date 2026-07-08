export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin read for the campaign dropdown on /admin/instagram/posts. Served from
// MySQL (Prisma) behind requireAdmin instead of the old service-role Supabase
// read.
export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  try {
    const data = await prisma.campaigns.findMany({
      select: { id: true, name: true },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json(
      { ok: true, data: jsonSafe(data) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
