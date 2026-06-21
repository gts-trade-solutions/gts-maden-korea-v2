// app/api/me/payouts/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";
import { supabaseForUser } from "@/lib/supabaseRoute";
import { requireEmailVerified } from "@/lib/auth/emailVerification";
import { createAdminNotification } from "@/lib/admin/notifications";

/** Helper: compute available-to-withdraw without requiring an RPC */
async function computeAvailable(sb: any, influencerId: string) {
  // Sum approved commissions
  const { data: atts } = await sb
    .from("order_attributions")
    .select("commission_amount, status")
    .eq("influencer_id", influencerId);
  const approved = (atts || [])
    .filter((r: any) => r.status === "approved")
    .reduce((a: number, r: any) => a + Number(r.commission_amount || 0), 0);

  // Sum payouts (initiated/processing/paid)
  const { data: pays } = await sb
    .from("influencer_payouts")
    .select("amount, status")
    .eq("influencer_id", influencerId)
    .in("status", ["initiated", "processing", "paid"]);
  const debited = (pays || []).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);

  return Math.max(0, approved - debited);
}

export async function POST(req: NextRequest) {
  const { user } = await getRouteAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Under NextAuth there is no Supabase session, so the RLS-gated withdraw math
  // (order_attributions / influencer_payouts) and the payout insert must run on
  // a service-role client scoped by user.id. influencer_available_to_withdraw
  // takes an explicit p_influencer_id, so it needs no _as wrapper.
  const sb = supabaseForUser(user.id);

  // Email verification gate. Payouts move real money — refusing them to
  // unverified accounts prevents typo'd-email actors from cashing out.
  const block = await requireEmailVerified(user.id);
  if (block) {
    return NextResponse.json(
      { ok: false, error: block.message, code: "email_not_verified" },
      { status: 403 }
    );
  }

  const { method, amount, contact_email, request_note } = await req.json().catch(() => ({}));

  const amt = Number(amount);
  if (!(amt > 0)) return NextResponse.json({ ok: false, error: "Amount must be > 0" }, { status: 400 });
  if (method !== "manual") return NextResponse.json({ ok: false, error: "Only manual payouts supported here" }, { status: 400 });

  // Try RPC first (if you have it); otherwise compute inline
  let available = 0;
  try {
    const { data } = await sb.rpc("influencer_available_to_withdraw", { p_influencer_id: user.id }).single();
    const avail = (data as any)?.available;
    if (data && typeof avail !== "undefined") {
      available = Number(avail || 0);
    } else {
      available = await computeAvailable(sb, user.id);
    }
  } catch {
    available = await computeAvailable(sb, user.id);
  }

  if (amt > available + 0.0001) {
    return NextResponse.json({ ok: false, error: "Amount exceeds available balance" }, { status: 400 });
  }

  // Store the request (no email side-effect)
  const note =
    request_note
      ? String(request_note)
      : `manual_payout | ${JSON.stringify({ contact: contact_email || null })}`;

  const { data, error } = await sb
    .from("influencer_payouts")
    .insert({
      influencer_id: user.id,
      amount: amt,
      currency: "INR",
      status: "initiated",      // Admin will move to processing/paid later
      notes: note,
      covering_orders: [],
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // Mirror the payout into MySQL (summary + payouts dashboard read MySQL).
  try {
    const { mirrorPayoutIntoMysql } = await import("@/lib/data/influencer");
    await mirrorPayoutIntoMysql(sb, data.id);
  } catch (e) {
    console.error("[dual-write] payout request MySQL mirror failed:", e);
  }

  // Admin bell notification — payouts move real money, so admins should
  // know about new requests promptly.
  void createAdminNotification({
    type: "payout_requested",
    title: `Payout request — ₹${amt.toFixed(2)}`,
    body: contact_email ? `Contact: ${contact_email}` : null,
    link: "/admin/influencers",
    severity: "warning",
    meta: { payout_id: data.id, user_id: user.id, amount: amt },
    createdBy: user.id,
  });

  return NextResponse.json({ ok: true, id: data.id });
}
