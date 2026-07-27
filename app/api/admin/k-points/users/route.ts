import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { adminAdjust, getBalance, getLedger, KPointsError } from "@/lib/k-points/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?q=email/name  → matching users with their K-Points balance
// GET ?userId=…      → one user's balance + recent ledger
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  if (userId) {
    const [user, balance, ledger] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } }),
      getBalance(userId),
      getLedger(userId, 100),
    ]);
    return NextResponse.json({ user, balance, ledger });
  }

  if (!q) return NextResponse.json({ users: [] });

  const users = await prisma.user.findMany({
    where: { OR: [{ email: { contains: q } }, { name: { contains: q } }] },
    select: { id: true, email: true, name: true },
    take: 25,
  });
  const balances = await Promise.all(users.map((u) => getBalance(u.id)));
  return NextResponse.json({
    users: users.map((u, i) => ({ ...u, balance: balances[i] })),
  });
}

// POST { userId, points, note }  → manual grant (+) or deduct (-)
export async function POST(req: NextRequest) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const points = Math.trunc(Number(body.points));
  if (!userId || !Number.isFinite(points) || points === 0) {
    return NextResponse.json({ ok: false, error: "BAD_INPUT" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return NextResponse.json({ ok: false, error: "NO_USER" }, { status: 404 });

  try {
    const balance = await adminAdjust({
      userId,
      points,
      actorId: user?.id ?? null,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
    });
    return NextResponse.json({ ok: true, balance });
  } catch (e) {
    if (e instanceof KPointsError && e.code === "INSUFFICIENT_POINTS") {
      return NextResponse.json({ ok: false, error: "INSUFFICIENT_POINTS" }, { status: 400 });
    }
    throw e;
  }
}
