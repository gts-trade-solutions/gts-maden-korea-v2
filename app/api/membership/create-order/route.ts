import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { MEMBERSHIP_PRICE } from "@/lib/membership";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const now = new Date();

    const activeMembership = await prisma.user_memberships.findFirst({
      where: { user_id: userId, status: "active", ends_at: { gt: now } },
      select: { id: true, ends_at: true },
      orderBy: { ends_at: "desc" },
    });

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
      currentExpiry: activeMembership?.ends_at
        ? activeMembership.ends_at.toISOString()
        : null,
    });
  } catch (error: any) {
    console.error("Create membership order error:", error);

    return NextResponse.json(
      { error: error.message || "Failed to create membership order" },
      { status: 500 }
    );
  }
}
