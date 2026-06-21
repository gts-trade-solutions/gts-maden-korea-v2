// POST /api/vendor/notify-signup
//
// Fires the admin bell notification after a vendor registers. The
// vendor register flow uses an RPC (`register_vendor`) directly from
// the client, so this thin route exists purely to drop a bell row
// from the server. Auth required — and we double-check the caller
// actually has a vendor row, so it can't be spammed.

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createServiceClient } from "@/lib/supabaseServer";
import { createAdminNotification } from "@/lib/admin/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const h = headers();

    let userId: string | null = null;
    const auth = h.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data } = await supabase.auth.getUser(auth.slice(7));
      userId = data.user?.id ?? null;
    }
    if (!userId) {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    }
    if (!userId)
      return NextResponse.json(
        { ok: false, reason: "unauthenticated" },
        { status: 401 }
      );

    // Confirm a vendor row actually exists for this user — RPC could've
    // failed silently from the client's POV, and we don't want to
    // notify on a no-op.
    const admin = createServiceClient();
    const { data: vendor } = await admin
      .from("vendors")
      .select("id, display_name, legal_name, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!vendor)
      return NextResponse.json(
        { ok: false, reason: "no_vendor" },
        { status: 400 }
      );

    const { data: authUser } = await admin.auth.admin.getUserById(userId);

    void createAdminNotification({
      type: "vendor_signed_up",
      title: `New vendor application — ${vendor.display_name || vendor.legal_name || authUser?.user?.email}`,
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
