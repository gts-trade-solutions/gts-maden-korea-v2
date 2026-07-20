import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

// GET /api/reviews/votes?review_ids=a,b,c -> { votes: { reviewId: isHelpful } }
// The current user's helpful votes for the given reviews. Empty for guests.
export async function GET(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ votes: {} });
  const ids = (new URL(req.url).searchParams.get("review_ids") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (!ids.length) return NextResponse.json({ votes: {} });

  const map: Record<string, boolean> = {};
  const { prisma } = await import("@/lib/db/prisma");
  const rows = await prisma.review_votes.findMany({
    where: { user_id: userId, review_id: { in: ids } },
    select: { review_id: true, is_helpful: true },
  });
  for (const r of rows) map[r.review_id] = r.is_helpful;
  return NextResponse.json({ votes: map });
}
