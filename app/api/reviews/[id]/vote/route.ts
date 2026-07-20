import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

// POST /api/reviews/[id]/vote  { is_helpful?: boolean }
// Upserts the user's helpful vote in MySQL and recomputes the review's
// helpful_count (port of the old sync_helpful_count trigger).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const reviewId = params.id;
  const body = await req.json().catch(() => ({} as any));
  const isHelpful = body?.is_helpful === false ? false : true;

  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.review_votes.upsert({
      where: { review_id_user_id: { review_id: reviewId, user_id: userId } },
      update: { is_helpful: isHelpful },
      create: { review_id: reviewId, user_id: userId, is_helpful: isHelpful },
    });
    const count = await prisma.review_votes.count({ where: { review_id: reviewId, is_helpful: true } });
    await prisma.product_reviews.update({ where: { id: reviewId }, data: { helpful_count: count } });
  } catch (e: any) {
    console.error("[reviews/vote] failed:", e);
    return NextResponse.json({ ok: false, error: e?.message || "VOTE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
