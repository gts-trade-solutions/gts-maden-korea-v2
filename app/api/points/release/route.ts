import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { release } from "@/lib/k-points/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Return reserved K-Points to the user's available balance when a checkout is
// abandoned/failed. Idempotent and safe: it only releases a still-"reserved"
// hold, and refuses if the order is already paid (points were settled).
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const orderId = String(body?.orderId || "");
  if (!orderId) return NextResponse.json({ ok: false, error: "NO_ORDER" }, { status: 400 });

  const order = await prisma.orders.findFirst({
    where: { id: orderId, user_id: userId },
    select: { status: true },
  });
  if (!order) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  if (order.status === "paid") {
    return NextResponse.json({ ok: true, released: false }); // already settled
  }

  await release(orderId);
  return NextResponse.json({ ok: true, released: true });
}
