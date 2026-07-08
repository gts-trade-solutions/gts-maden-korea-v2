import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUserId } from "@/lib/auth/identity";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// Normalize an incoming address body (NOT NULL cols coerced to "").
function normalize(b: any) {
  return {
    name: b?.name ?? null,
    phone: b?.phone ?? null,
    email: b?.email || null,
    line1: b?.line1 || "",
    line2: b?.line2 || null,
    landmark: b?.landmark || null,
    city: b?.city || "",
    state: b?.state || "",
    pincode: b?.pincode || "",
    country: b?.country || "India",
    is_default: !!b?.is_default,
  };
}

// GET — list the user's addresses (MySQL).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const rows = await prisma.addresses.findMany({
    where: { user_id: userId },
    select: { id: true, name: true, phone: true, email: true, line1: true, line2: true, landmark: true, city: true, state: true, pincode: true, country: true, is_default: true },
    orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
  });
  return NextResponse.json({ addresses: jsonSafe(rows) });
}

// POST — create an address (MySQL). If is_default, clear other defaults first.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const row = normalize(await req.json().catch(() => ({})));
  const id = randomUUID();

  try {
    await prisma.$transaction([
      ...(row.is_default
        ? [prisma.addresses.updateMany({ where: { user_id: userId }, data: { is_default: false } })]
        : []),
      prisma.addresses.create({ data: { id, user_id: userId, ...row } }),
    ]);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "create failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
