import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: active K-Points packs for the buy UI. Prices are INR-canonical; the
// storefront converts for display via useCurrency().
export async function GET() {
  const packs = await prisma.kPointsPack.findMany({
    where: { active: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, points: true, bonusPoints: true, priceInr: true },
  });
  return NextResponse.json({
    packs: packs.map((p) => ({
      id: p.id,
      points: p.points,
      bonusPoints: p.bonusPoints,
      priceInr: Number(p.priceInr),
    })),
  });
}
