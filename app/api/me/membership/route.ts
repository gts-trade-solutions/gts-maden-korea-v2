import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/me/membership — the signed-in user's active membership (or null).
// Backend-aware: identity via the seam (Supabase session today, NextAuth at the
// flip); data from MySQL when CATALOG_BACKEND=mysql, else Supabase service-role.
// Lets client components (checkout) read membership without a browser Supabase
// session (which threw "Auth session missing!" under NextAuth).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ membership: null });

  if (process.env.CATALOG_BACKEND === "mysql") {
    const { prisma } = await import("@/lib/db/prisma");
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

  const { createServiceClient } = await import("@/lib/supabaseServer");
  const sb = createServiceClient();
  const { data } = await sb
    .from("user_memberships")
    .select("id, user_id, plan_code, plan_name, amount, duration_days, status, starts_at, ends_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ membership: data ?? null });
}
