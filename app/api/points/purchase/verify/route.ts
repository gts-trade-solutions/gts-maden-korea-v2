import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { earn, getBalance } from "@/lib/k-points/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verify a "buy K-Points" payment and credit the points (idempotent per
// purchase order).
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    const body = await req.json().catch(() => ({}));
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!userId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: "Missing verification fields" }, { status: 400 });
    }

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (expected !== razorpay_signature) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    const po = await prisma.kPointsPurchaseOrder.findFirst({
      where: { razorpayOrderId: razorpay_order_id, userId },
    });
    if (!po) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });

    // Idempotent: already credited.
    if (po.status === "paid") {
      return NextResponse.json({ success: true, balance: await getBalance(userId) });
    }

    await prisma.kPointsPurchaseOrder.update({
      where: { id: po.id },
      data: { status: "paid", paidAt: new Date() },
    });

    const { balance } = await earn({
      userId,
      points: po.points,
      reason: "buy",
      sourceType: "points_purchase",
      sourceId: po.id,
      meta: { packId: po.packId, amount: Number(po.amount) },
    });

    return NextResponse.json({ success: true, balance });
  } catch (e: any) {
    console.error("[points/purchase/verify]", e);
    return NextResponse.json({ error: e?.message || "Verification failed" }, { status: 500 });
  }
}
