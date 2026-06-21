import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import { MEMBERSHIP_PRICE } from "@/lib/membership";
import { getRouteUser } from "@/lib/auth/routeUser";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const userId = (await getRouteUser(req))?.id ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const now = new Date().toISOString();

    const { data: activeMembership, error: membershipError } =
      await supabaseAdmin
        .from("user_memberships")
        .select("id, ends_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .gt("ends_at", now)
        .order("ends_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { error: membershipError.message },
        { status: 500 }
      );
    }

    const amount = Math.round(MEMBERSHIP_PRICE * 100);

    const shortReceipt = `kp_${userId.slice(0, 8)}_${Date.now()
  .toString()
  .slice(-8)}`;

const order = await razorpay.orders.create({
  amount,
  currency: "INR",
  receipt: shortReceipt,
  notes: {
    type: "membership",
    plan_code: "k_plus",
    user_id: userId,
  },
});

    return NextResponse.json({
      success: true,
      order,
      key:
        process.env.RAZORPAY_KEY_ID ||
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
        null,
      alreadyActive: !!activeMembership,
      currentExpiry: activeMembership?.ends_at ?? null,
    });
  } catch (error: any) {
    console.error("Create membership order error:", error);

    return NextResponse.json(
      { error: error.message || "Failed to create membership order" },
      { status: 500 }
    );
  }
}
