import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

// POST /api/reviews/[id]/vote  { is_helpful?: boolean }
// Upserts the user's helpful vote. Dual-write: Supabase (its trigger recomputes
// helpful_count) + MySQL (we recompute helpful_count to match sync_helpful_count).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const reviewId = params.id;
  const body = await req.json().catch(() => ({} as any));
  const isHelpful = body?.is_helpful === false ? false : true;

  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { error } = await sb
    .from("review_votes")
    .upsert({ review_id: reviewId, user_id: userId, is_helpful: isHelpful }, { onConflict: "review_id,user_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.review_votes.upsert({
      where: { review_id_user_id: { review_id: reviewId, user_id: userId } },
      update: { is_helpful: isHelpful },
      create: { review_id: reviewId, user_id: userId, is_helpful: isHelpful },
    });
    const count = await prisma.review_votes.count({ where: { review_id: reviewId, is_helpful: true } });
    await prisma.product_reviews.update({ where: { id: reviewId }, data: { helpful_count: count } });
  } catch (e) {
    console.error("[dual-write] review vote MySQL failed:", e);
  }
  return NextResponse.json({ ok: true });
}
