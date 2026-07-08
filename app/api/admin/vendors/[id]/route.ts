export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only single-vendor read + actions. Backend-aware admin check
// (requireAdmin) + Prisma/MySQL data access.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

// GET /api/admin/vendors/[id] — vendor + up to 25 of its products.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const vendor = await prisma.vendors.findUnique({ where: { id: params.id } });
    if (!vendor) return json({ ok: false, error: "NOT_FOUND" }, 404);

    const products = await prisma.products.findMany({
      where: { vendor_id: params.id },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        currency: true,
        is_published: true,
      },
      orderBy: { updated_at: "desc" },
      take: 25,
    });

    return json(jsonSafe({ ok: true, vendor, products: products ?? [] }));
  } catch (e: any) {
    return json({ ok: false, error: e?.message }, 500);
  }
}

// PATCH /api/admin/vendors/[id] — { action: "approve" | "suspend" | "commission", ... }
//   approve     → status=approved, approved_by = the acting admin
//   suspend     → status=disabled|rejected + rejected_reason
//   commission  → commission_rate (0..100)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({} as any));
  let patch: Record<string, any> = {};

  if (body.action === "approve") {
    patch = {
      status: "approved",
      rejected_reason: null,
      approved_by: user?.id ?? null,
      approved_at: new Date(),
    };
  } else if (body.action === "suspend") {
    const to = body.status === "rejected" ? "rejected" : "disabled";
    const reason = String(body.reason || "").trim();
    if (!reason) return json({ ok: false, error: "Reason required" }, 400);
    patch = { status: to, rejected_reason: reason };
  } else if (body.action === "commission") {
    const rate = Math.max(0, Math.min(100, Number(body.commission_rate) || 0));
    patch = { commission_rate: rate };
  } else {
    return json({ ok: false, error: "BAD_ACTION" }, 400);
  }

  try {
    await prisma.vendors.updateMany({ where: { id: params.id }, data: patch });
  } catch (e: any) {
    return json({ ok: false, error: e?.message }, 500);
  }

  return json(jsonSafe({ ok: true, patch }));
}
