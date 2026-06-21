import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

export async function GET(req: NextRequest) {
  const { user, sb } = await getRouteAuth(req);

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Read path behind the flag: MySQL (mirrored) vs Supabase (authoritative).
  // Auth above stays on Supabase until the auth-session flip.
  if (process.env.CATALOG_BACKEND === "mysql") {
    try {
      const { getInfluencerSummaryMysql } = await import("@/lib/data/influencer");
      const summary = await getInfluencerSummaryMysql(user.id);
      return NextResponse.json({ ok: true, ...summary });
    } catch (e) {
      console.error("[me/summary] MySQL read failed, falling back to Supabase:", e);
      // fall through to the Supabase path below
    }
  }

  // ---------- 1) Commissions: order_attributions ----------
  const { data: lifeAgg, error: lifeErr } = await sb
    .from("order_attributions")
    .select("commission_amount, status")
    .eq("influencer_id", user.id);

  if (lifeErr) {
    console.error("order_attributions error", lifeErr);
    return NextResponse.json(
      { ok: false, error: "Failed to load earnings." },
      { status: 500 }
    );
  }

  const commissionRows: any[] = lifeAgg || [];

  // Total commission from all orders (any status)
  const lifetime = commissionRows.reduce(
    (sum, r) => sum + Number(r.commission_amount || 0),
    0
  );

  // Only "approved" commission is actually withdrawable
  const approvedCommission = commissionRows
    .filter((r) => r.status === "approved")
    .reduce(
      (sum, r) => sum + Number(r.commission_amount || 0),
      0
    );

  // ---------- 2) Payouts: influencer_payouts ----------
  const { data: payoutsAgg, error: payoutsErr } = await sb
    .from("influencer_payouts")
    .select("amount, status")
    .eq("influencer_id", user.id);

  if (payoutsErr) {
    console.error("payouts error", payoutsErr);
    return NextResponse.json(
      { ok: false, error: "Failed to load payouts." },
      { status: 500 }
    );
  }

  const payoutRows: any[] = payoutsAgg || [];

  // Treat legacy "pending" as pending too, along with "initiated" & "processing"
  const pendingPayout = payoutRows
    .filter((r) =>
      ["pending", "initiated", "processing"].includes(String(r.status))
    )
    .reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0
    );

  const paidPayout = payoutRows
    .filter((r) => String(r.status) === "paid")
    .reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0
    );

  // Everything that is not failed/canceled but already requested is "debited"
  const debited = pendingPayout + paidPayout;

  // ---------- 3) Available wallet ----------
  // Available = approved commissions – (pending payouts + paid payouts)
  const available = Math.max(0, approvedCommission - debited);

  // ---------- 4) Per-influencer cap settings ----------
  // commission_cap_pct drives the dashboard's Create-promo form
  // limits; default_user_discount_pct seeds the "Recommended" button.
  // Both admin-managed via /admin/influencers. Returned as numbers
  // (smallint in DB), or null if the influencer's row hasn't been
  // configured yet (which shouldn't happen post-migration, but we
  // surface the absence so the UI can show a helpful banner).
  const { data: prof } = await sb
    .from("influencer_profiles")
    .select("commission_cap_pct, default_user_discount_pct, applicable_countries")
    .eq("user_id", user.id)
    .maybeSingle();

  // Region allow-list — empty array (or null) signals "active in every
  // supported country" so the dashboard can render the friendly
  // "all countries" badge instead of an empty chip strip.
  const applicableCountries: string[] = Array.isArray(
    (prof as any)?.applicable_countries
  )
    ? ((prof as any).applicable_countries as string[])
    : [];

  return NextResponse.json({
    ok: true,
    lifetime_commission: lifetime,       // total earned (all statuses)
    pending_total: pendingPayout,        // payout requests waiting (UI "Pending")
    paid_total: paidPayout,              // fully paid-out withdrawals
    available_to_withdraw: available,    // current wallet balance
    commission_cap_pct:
      prof?.commission_cap_pct != null
        ? Number(prof.commission_cap_pct)
        : null,
    default_user_discount_pct:
      prof?.default_user_discount_pct != null
        ? Number(prof.default_user_discount_pct)
        : null,
    applicable_countries: applicableCountries,
  });
}
