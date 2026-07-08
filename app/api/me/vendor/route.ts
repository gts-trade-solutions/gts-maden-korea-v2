export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { getSessionUser } from "@/lib/auth/session";

// GET /api/me/vendor — resolves the current session user's vendor.
// Replaces the browser-direct `supabase.rpc("get_my_vendor")` call the
// ProductEditor gate used (RLS-blocked under NextAuth). Looks up the vendor
// the user is a member of (vendor_members), falling back to a vendor they own
// (vendors.owner_profile_id). Returns 401 when there is no session so the
// caller can bounce to the vendor login.
const VENDOR_SELECT = {
  id: true,
  display_name: true,
  slug: true,
  status: true,
  rejected_reason: true,
} as const;

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Membership takes priority (mirrors get_my_vendor), then ownership.
    const member = await prisma.vendor_members.findFirst({
      where: { user_id: user.id },
      select: { role: true, vendors: { select: VENDOR_SELECT } },
      orderBy: { created_at: "asc" },
    });

    let vendor: any = member?.vendors
      ? { ...member.vendors, role: member.role ?? null }
      : null;

    if (!vendor) {
      const owned = await prisma.vendors.findFirst({
        where: { owner_profile_id: user.id },
        select: VENDOR_SELECT,
        orderBy: { created_at: "asc" },
      });
      if (owned) vendor = { ...owned, role: "owner" };
    }

    return NextResponse.json(
      { ok: true, vendor: vendor ? jsonSafe(vendor) : null },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
