import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getAccessState } from "@/lib/integrations/skinEntitlement";
import { prisma } from "@/lib/db/prisma";
import { getKPointsSettings } from "@/lib/k-points/config";
import { getBalance } from "@/lib/k-points/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Drives the /skin-analyzer feature page: is the user logged in, do they have a
// scan available, is a request pending, and what was their last result.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ authed: false });

  const state = await getAccessState(user.id);

  const [last, pendingRequest, settings, balance] = await Promise.all([
    prisma.skinAnalysis.findFirst({
      where: { userId: user.id, status: "done" },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    }),
    prisma.skinAccessRequest.count({
      where: { userId: user.id, status: "pending" },
    }),
    getKPointsSettings(),
    getBalance(user.id),
  ]);

  return NextResponse.json({
    authed: true,
    state,
    lastAnalysisId: last?.id ?? null,
    pendingRequest: pendingRequest > 0,
    // K-Points gating for the analyzer CTA
    pointsCost: settings.skinAnalyzerCostPoints,
    pointsBalance: balance.available,
  });
}
