import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { concernLabel, type SkinSummary } from "@/lib/integrations/skinConcerns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

// All completed skin analyses across accounts, newest first, with the owner's
// email/name and a headline (score + top concerns). Supports ?page= and an
// optional ?q= email/name filter.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  // When filtering by email/name, resolve matching user ids first.
  let userIdFilter: string[] | undefined;
  if (q) {
    const matches = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: q } },
          { name: { contains: q } },
        ],
      },
      select: { id: true },
      take: 500,
    });
    userIdFilter = matches.map((m) => m.id);
    // No user matched → empty result set.
    if (!userIdFilter.length) {
      return NextResponse.json({ analyses: [], page, pageSize: PAGE_SIZE, total: 0 });
    }
  }

  const where = {
    status: "done",
    ...(userIdFilter ? { userId: { in: userIdFilter } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.skinAnalysis.count({ where }),
    prisma.skinAnalysis.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, userId: true, createdAt: true, kind: true, summary: true },
    }),
  ]);

  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    page,
    pageSize: PAGE_SIZE,
    total,
    analyses: rows.map((r) => {
      const s = (r.summary as SkinSummary | null) ?? {};
      return {
        id: r.id,
        userId: r.userId,
        email: byId.get(r.userId)?.email ?? null,
        name: byId.get(r.userId)?.name ?? null,
        createdAt: r.createdAt,
        kind: r.kind,
        overall: s.overall ?? null,
        topConcerns: (s.top_concerns ?? []).slice(0, 3).map(concernLabel),
      };
    }),
  });
}
