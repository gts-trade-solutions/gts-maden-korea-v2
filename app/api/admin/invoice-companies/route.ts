export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin invoice-companies read (MySQL/Prisma). Serves the invoice "new" / "edit"
// company dropdowns. Read-only; admin-gated.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  try {
    const data = await prisma.invoice_companies.findMany({
      select: {
        id: true,
        key: true,
        display_name: true,
        address: true,
        gst_number: true,
        email: true,
      },
      orderBy: { display_name: "asc" },
    });
    return json({ ok: true, data: jsonSafe(data ?? []) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
