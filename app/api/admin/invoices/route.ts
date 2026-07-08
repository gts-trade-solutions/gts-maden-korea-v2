export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin invoices read endpoint (MySQL/Prisma). Admin-gated.
//   GET            -> list (invoices + invoice_companies.display_name)
//   GET?id=<uuid>  -> single invoice (+ invoice_companies + invoice_items)
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const id = new URL(req.url).searchParams.get("id");

  // Single invoice. Includes BOTH joins so the detail page (needs
  // invoice_companies + invoice_items) and the edit page (needs invoice_items;
  // ignores the extra company join) are both served unchanged.
  if (id) {
    try {
      const data = await prisma.invoices.findUnique({
        where: { id },
        include: {
          invoice_companies: true,
          invoice_items: true,
        },
      });
      if (!data) return json({ ok: false, error: "NOT_FOUND" }, 500);
      return json({ ok: true, data: jsonSafe(data) });
    } catch (e: any) {
      return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
    }
  }

  // List. Same fields + order the list page used.
  try {
    const data = await prisma.invoices.findMany({
      select: {
        id: true,
        invoice_number: true,
        invoice_date: true,
        customer_name: true,
        total_amount: true,
        invoice_companies: { select: { display_name: true } },
      },
      orderBy: { created_at: "desc" },
    });
    return json({ ok: true, data: jsonSafe(data) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
