import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/auth/session";
import { reserve, grant } from "@/lib/integrations/skinEntitlement";
import { buildHandoffUrl } from "@/lib/integrations/skinAnalyzer";
import { getKPointsSettings } from "@/lib/k-points/config";
import { getBalance, spend } from "@/lib/k-points/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reserve a scan and mint the signed handoff URL to the analyzer. The client
// then does window.location = redirectUrl.
//
// Access model: reuse an existing reservation / admin-granted scan for free;
// otherwise, when the analyzer is points-gated (skinAnalyzerCostPoints > 0),
// spend K-Points to unlock one. When the cost is 0 the legacy free-scan
// behaviour applies.
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let grantId = await reserve(user.id);

  if (!grantId) {
    const settings = await getKPointsSettings();
    const cost = settings.skinAnalyzerCostPoints;
    if (cost > 0) {
      const balance = await getBalance(user.id);
      if (balance.available < cost) {
        return NextResponse.json(
          {
            error: "insufficient_points",
            message: `You need ${cost} K-Points to run an analysis.`,
            cost,
            balance: balance.available,
          },
          { status: 402 },
        );
      }
      // Spend, grant a scan, then claim it.
      await spend({
        userId: user.id,
        points: cost,
        reason: "skin_access",
        sourceType: "skin",
        sourceId: randomUUID(),
        meta: { cost },
      });
      await grant(user.id, "points");
      grantId = await reserve(user.id);
    }
  }

  if (!grantId) {
    return NextResponse.json(
      { error: "no_access", message: "You have no analyses remaining." },
      { status: 403 },
    );
  }

  try {
    const redirectUrl = buildHandoffUrl({
      userId: user.id,
      email: user.email,
      name: user.name,
      grantId,
    });
    return NextResponse.json({ redirectUrl });
  } catch (e) {
    // Missing SKIN_ANALYZER_URL / secret — a config error, not the user's fault.
    return NextResponse.json(
      { error: "not_configured", message: (e as Error).message },
      { status: 500 },
    );
  }
}
