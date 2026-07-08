// POST /api/vendor/notify-signup
//
// Fires the admin bell notification after a vendor registers. The
// vendor register flow creates the vendor row directly, so this thin
// route exists purely to drop a bell row from the server. Auth
// required — and we double-check the caller actually has a vendor row,
// so it can't be spammed.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminNotification } from "@/lib/admin/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user)
      return NextResponse.json(
        { ok: false, reason: "unauthenticated" },
        { status: 401 }
      );

    const userId = user.id;

    // Confirm a vendor row actually exists for this user — registration
    // could've failed silently from the client's POV, and we don't want
    // to notify on a no-op.
    const vendor = await prisma.vendors.findFirst({
      where: { owner_profile_id: userId },
      select: { id: true, display_name: true, legal_name: true, status: true },
    });
    if (!vendor)
      return NextResponse.json(
        { ok: false, reason: "no_vendor" },
        { status: 400 }
      );

    void createAdminNotification({
      type: "vendor_signed_up",
      title: `New vendor application — ${vendor.display_name || vendor.legal_name || user.email}`,
      body: vendor.legal_name ? `Legal: ${vendor.legal_name}` : null,
      link: "/admin/vendors",
      severity: "info",
      meta: {
        vendor_id: vendor.id,
        user_id: userId,
        status: vendor.status,
      },
      createdBy: userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[vendor-notify-signup] unexpected error:", err);
    return NextResponse.json(
      { ok: false, reason: "internal_error" },
      { status: 500 }
    );
  }
}
