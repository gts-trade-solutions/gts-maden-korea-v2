export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// GET /api/admin/vendors — admin-only vendor list. Backend-aware admin check via
// requireAdmin (Supabase session or NextAuth JWT role); data via Prisma/MySQL.
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const vendors = await prisma.vendors.findMany({
      select: {
        id: true,
        display_name: true,
        legal_name: true,
        slug: true,
        email: true,
        phone: true,
        gstin: true,
        status: true,
        commission_rate: true,
        created_at: true,
        approved_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json(
      { ok: true, vendors: jsonSafe(vendors) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
