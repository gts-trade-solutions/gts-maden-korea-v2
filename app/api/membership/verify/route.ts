import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { randomUUID } from "node:crypto";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = await getSessionUserId();

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

    const existingActive = await prisma.user_memberships.findFirst({
      where: { user_id: userId, status: "active", ends_at: { gt: now } },
      select: { id: true, ends_at: true },
      orderBy: { ends_at: "desc" },
    });

    let startsAt = now;
    let endsAt = addDays(now, 90);

    if (existingActive?.ends_at) {
      const existingEnd = new Date(existingActive.ends_at);
      if (existingEnd.getTime() > now.getTime()) {
        endsAt = addDays(existingEnd, 90);
      }
    }

    await prisma.user_memberships.create({
      data: {
        id: randomUUID(),
        user_id: userId,
        plan_code: "k_plus",
        plan_name: "K-Plus",
        amount: 199,
        duration_days: 90,
        status: "active",
        starts_at: startsAt,
        ends_at: endsAt,
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
      },
    });

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
