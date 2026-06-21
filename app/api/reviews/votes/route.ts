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
  if (process.env.CATALOG_BACKEND === "mysql") {
    const { prisma } = await import("@/lib/db/prisma");
    const rows = await prisma.review_votes.findMany({
      where: { user_id: userId, review_id: { in: ids } },
      select: { review_id: true, is_helpful: true },
    });
    for (const r of rows) map[r.review_id] = r.is_helpful;
    return NextResponse.json({ votes: map });
  }

  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  // Scope by user_id explicitly — under NextAuth the service-role client bypasses
  // the RLS policy that otherwise restricts this to the current user's votes.
  const { data } = await sb.from("review_votes").select("review_id, is_helpful").eq("user_id", userId).in("review_id", ids);
  for (const r of data ?? []) map[(r as any).review_id] = !!(r as any).is_helpful;
  return NextResponse.json({ votes: map });
}
