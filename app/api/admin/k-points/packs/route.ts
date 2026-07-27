import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const list = () =>
  prisma.kPointsPack.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  return NextResponse.json({ packs: await list() });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const points = Math.max(1, Math.floor(Number(b.points) || 0));
  const priceInr = Number(b.priceInr);
  if (!points || !Number.isFinite(priceInr) || priceInr <= 0) {
    return NextResponse.json({ ok: false, error: "BAD_INPUT" }, { status: 400 });
  }
  await prisma.kPointsPack.create({
    data: {
      points,
      bonusPoints: Math.max(0, Math.floor(Number(b.bonusPoints) || 0)),
      priceInr,
      active: b.active !== false,
      position: Math.floor(Number(b.position) || 0),
    },
  });
  return NextResponse.json({ ok: true, packs: await list() });
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ ok: false, error: "NO_ID" }, { status: 400 });
  const data: Record<string, any> = {};
  if (Number.isFinite(b.points)) data.points = Math.max(1, Math.floor(b.points));
  if (Number.isFinite(b.bonusPoints)) data.bonusPoints = Math.max(0, Math.floor(b.bonusPoints));
  if (Number.isFinite(b.priceInr) && b.priceInr > 0) data.priceInr = b.priceInr;
  if (typeof b.active === "boolean") data.active = b.active;
  if (Number.isFinite(b.position)) data.position = Math.floor(b.position);
  await prisma.kPointsPack.update({ where: { id: b.id }, data });
  return NextResponse.json({ ok: true, packs: await list() });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ ok: false, error: "NO_ID" }, { status: 400 });
  await prisma.kPointsPack.delete({ where: { id: b.id } });
  return NextResponse.json({ ok: true, packs: await list() });
}
