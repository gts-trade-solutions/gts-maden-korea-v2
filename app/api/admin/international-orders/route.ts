export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin: international order requests list (MySQL/Prisma). Mirrors the page's
// exact select/order/limit so the page renders unchanged. Admin-gated.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  try {
    const data = await prisma.international_orders.findMany({
      orderBy: { created_at: "desc" },
      take: 200,
    });
    return json({ ok: true, data: jsonSafe(data ?? []) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
