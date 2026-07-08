import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/me/membership — the signed-in user's active membership (or null).
// Identity via NextAuth session; data from MySQL via Prisma. Lets client
// components (checkout) read membership without a browser DB session.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ membership: null });

  const m = await prisma.user_memberships.findFirst({
    where: { user_id: userId, status: "active", ends_at: { gt: new Date() } },
    select: {
      id: true, user_id: true, plan_code: true, plan_name: true, amount: true,
      duration_days: true, status: true, starts_at: true, ends_at: true,
    },
    orderBy: { ends_at: "desc" },
  });
  return NextResponse.json({ membership: m ? jsonSafe(m) : null });
}
