import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { randomUUID } from "node:crypto";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Start a "buy K-Points" checkout. Charged in INR (canonical, like K-Plus);
// the storefront displays the converted price. Not part of the product order
// pipeline.
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const packId = String(body?.packId || "");
    const pack = await prisma.kPointsPack.findFirst({ where: { id: packId, active: true } });
    if (!pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });

    const points = pack.points + pack.bonusPoints;
    const amountInr = Number(pack.priceInr);
    const purchaseId = randomUUID();

    const order = await razorpay.orders.create({
      amount: Math.round(amountInr * 100),
      currency: "INR",
      receipt: `kpt_${userId.slice(0, 8)}_${Date.now().toString().slice(-8)}`,
      notes: { type: "points_purchase", user_id: userId, pack_id: pack.id, points },
    });

    await prisma.kPointsPurchaseOrder.create({
      data: {
        id: purchaseId,
        userId,
        packId: pack.id,
        points,
        amount: amountInr,
        currency: "INR",
        razorpayOrderId: order.id,
        status: "created",
      },
    });

    return NextResponse.json({
      success: true,
      order,
      points,
      purchaseId,
      key: process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null,
    });
  } catch (e: any) {
    console.error("[points/purchase/create]", e);
    return NextResponse.json({ error: e?.message || "Failed to start purchase" }, { status: 500 });
  }
}
