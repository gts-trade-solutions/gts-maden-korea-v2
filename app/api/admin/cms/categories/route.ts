export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

// GET /api/admin/cms/categories → { ok, categories } (MySQL). Backs the CMS
// categories list. Same columns/order the page's old Supabase select used.
export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const categories = await prisma.categories.findMany({
    select: { id: true, slug: true, name: true, description: true, created_at: true },
    orderBy: { created_at: "desc" },
  });
  return json({ ok: true, categories: jsonSafe(categories) });
}
