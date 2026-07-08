export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only audit list: published products without a usable
// gross_weight_g. Surfaces the data dependency that shipping math
// (India DTDC + international EMS slabs) has on weight — admin can
// scan, click into the product editor, and backfill.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const data = await prisma.products.findMany({
    where: {
      is_published: true,
      OR: [{ gross_weight_g: null }, { gross_weight_g: { lte: 0 } }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true, slug: true, name: true,
      net_weight_g: true, gross_weight_g: true,
      brands: { select: { name: true } },
    },
  });

  const rows = data.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brands?.name ?? null,
    net_weight_g: p.net_weight_g,
    gross_weight_g: p.gross_weight_g,
  }));

  return json({ ok: true, total: rows.length, rows: jsonSafe(rows) });
}
