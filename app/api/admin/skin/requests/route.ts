import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pending "request another skin analysis" queue for the admin.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const requests = await prisma.skinAccessRequest.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const userIds = Array.from(new Set(requests.map((r) => r.userId)));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      userId: r.userId,
      email: byId.get(r.userId)?.email ?? null,
      name: byId.get(r.userId)?.name ?? null,
      note: r.note,
      createdAt: r.createdAt,
    })),
  });
}
