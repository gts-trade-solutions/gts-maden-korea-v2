import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { verifyCallback } from "@/lib/integrations/skinAnalyzer";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Signed server-to-server post-back from the analyzer. Verifies the HMAC, is
// idempotent on analyzer_analysis_id, validates + consumes the reservation, and
// stores the canonical result. See SKIN_ANALYZER_INTEGRATION.md.

type IssueIn = {
  issue_type: string;
  score: number | null;
  confidence: number | null;
  severity_band: string | null;
  details: unknown;
};
type CallbackBody = {
  analyzer_analysis_id: string;
  grant_id: string;
  mk_user_id: string;
  kind: string;
  summary: unknown;
  issues: IssueIn[];
};

const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v == null ? undefined : (v as Prisma.InputJsonValue);

export async function POST(req: NextRequest) {
  // 1. Verify signature over the EXACT raw body (must read text, not json).
  const rawBody = await req.text();
  if (!verifyCallback(rawBody, req.headers.get("x-mk-signature"))) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let body: CallbackBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  const { analyzer_analysis_id, grant_id, mk_user_id } = body;
  if (!analyzer_analysis_id || !grant_id || !mk_user_id) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // 2. Idempotency — a retried post-back for the same analysis returns the
  //    already-stored row.
  const existing = await prisma.skinAnalysis.findUnique({
    where: { analyzerAnalysisId: analyzer_analysis_id },
  });
  if (existing) return NextResponse.json({ analysisId: existing.id });

  // 3. Validate the grant belongs to this user and is still reservable.
  const ent = await prisma.skinEntitlement.findUnique({
    where: { id: grant_id },
  });
  if (!ent || ent.userId !== mk_user_id) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 409 });
  }
  if (ent.state === "released") {
    return NextResponse.json({ error: "grant_expired" }, { status: 410 });
  }
  if (ent.state === "consumed") {
    // Consumed for a different analysis id — surface whatever it produced.
    if (ent.analysisId) {
      const a = await prisma.skinAnalysis.findUnique({
        where: { id: ent.analysisId },
      });
      if (a) return NextResponse.json({ analysisId: a.id });
    }
    return NextResponse.json({ error: "grant_consumed" }, { status: 409 });
  }
  // state === "available" would mean it was never reserved — reject.
  if (ent.state !== "reserved") {
    return NextResponse.json({ error: "grant_not_reserved" }, { status: 409 });
  }
  // We intentionally accept a reservation even if its TTL just passed but it
  // hasn't been released yet — the analysis is real; don't lose the result.

  // 4. Store result + consume the reservation atomically.
  try {
    const created = await prisma.$transaction(async (tx) => {
      const a = await tx.skinAnalysis.create({
        data: {
          userId: mk_user_id,
          analyzerAnalysisId: analyzer_analysis_id,
          grantId: grant_id,
          status: "done",
          kind: body.kind || "face",
          summary: asJson(body.summary),
          completedAt: new Date(),
          issues: {
            create: (body.issues ?? []).map((i) => ({
              issueType: i.issue_type,
              score: i.score ?? undefined,
              confidence: i.confidence ?? undefined,
              severityBand: i.severity_band ?? undefined,
              details: asJson(i.details),
            })),
          },
        },
      });
      // CAS: only consume if still reserved (guards a concurrent callback).
      const consumed = await tx.skinEntitlement.updateMany({
        where: { id: grant_id, state: "reserved" },
        data: { state: "consumed", consumedAt: new Date(), analysisId: a.id },
      });
      if (consumed.count === 0) {
        // Lost the race — another callback consumed it. Throw to roll back the
        // analysis row we just created in this transaction.
        throw new Error("cas_lost");
      }
      return a;
    });
    return NextResponse.json({ analysisId: created.id });
  } catch (e) {
    // Unique violation on analyzer_analysis_id or the CAS race → a concurrent
    // callback already stored it. Return that row.
    const dup = await prisma.skinAnalysis.findUnique({
      where: { analyzerAnalysisId: analyzer_analysis_id },
    });
    if (dup) return NextResponse.json({ analysisId: dup.id });
    return NextResponse.json({ error: "store_failed" }, { status: 500 });
  }
}
