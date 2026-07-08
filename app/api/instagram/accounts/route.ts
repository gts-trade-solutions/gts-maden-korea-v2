export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin read for the account dropdown on /admin/instagram/inbox. Served from
// MySQL (Prisma) behind requireAdmin instead of the old service-role Supabase
// read.
export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  try {
    const data = await prisma.instagram_accounts.findMany({
      select: { id: true, username: true, ig_business_account_id: true },
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
