import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getRouteUser } from "@/lib/auth/routeUser";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = (await getRouteUser(req))?.id ?? null;

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body;

    if (
      !userId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return NextResponse.json(
        { error: "Missing payment verification fields" },
        { status: 400 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const { data: existingActive, error: existingError } = await supabaseAdmin
      .from("user_memberships")
      .select("id, ends_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("ends_at", nowIso)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    let startsAt = now;
    let endsAt = addDays(now, 90);

    if (existingActive?.ends_at) {
      const existingEnd = new Date(existingActive.ends_at);
      if (existingEnd.getTime() > now.getTime()) {
        endsAt = addDays(existingEnd, 90);
      }
    }

    const { error: insertError } = await supabaseAdmin
      .from("user_memberships")
      .insert({
        user_id: userId,
        plan_code: "k_plus",
        plan_name: "K-Plus",
        amount: 199,
        duration_days: 90,
        status: "active",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    // Dual-write: mirror the new membership into MySQL so the cart/checkout
    // free-shipping math (which reads membership from MySQL) sees the member
    // immediately. Best-effort — never fail a paid membership.
    try {
      const { mirrorMembershipsIntoMysql } = await import("@/lib/data/membership");
      await mirrorMembershipsIntoMysql(supabaseAdmin, userId);
    } catch (e) {
      console.error("[dual-write] membership verify MySQL mirror failed:", e);
    }

    return NextResponse.json({
      success: true,
      membership: {
        plan_name: "K-Plus",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Verify membership payment error:", error);

    return NextResponse.json(
      { error: error.message || "Failed to verify membership payment" },
      { status: 500 }
    );
  }
}
