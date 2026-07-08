export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Admin brand list read, MySQL-authoritative (Prisma). Mirrors the old
// browser Supabase select in app/admin/cms/brands/page.tsx: ordered
// position asc then created_at desc. Writes still flow through adminWrite.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  try {
    const brands = await prisma.brands.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        thumbnail_path: true,
        thumbnail_url: true,
        active: true,
        position: true,
        created_at: true,
      },
      orderBy: [{ position: "asc" }, { created_at: "desc" }],
    });
    return json({ ok: true, brands: jsonSafe(brands) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
