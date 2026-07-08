import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET reads the profile (MySQL).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const p = await prisma.profiles.findUnique({
    where: { id: userId },
    select: { full_name: true, avatar_url: true, phone: true },
  });
  return NextResponse.json({ profile: jsonSafe(p) });
}

// PATCH updates profile fields (MySQL).
export async function PATCH(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const patch: Record<string, any> = {};
  if (typeof body.full_name === "string") patch.full_name = body.full_name;
  if (typeof body.phone === "string") patch.phone = body.phone;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  try {
    await prisma.profiles.update({ where: { id: userId }, data: patch });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
