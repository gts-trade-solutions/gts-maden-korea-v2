import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

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

// PATCH — update an address, or set it as default (body { action: "set_default" }).
// MySQL uses updateMany scoped to (id, user_id) for ownership.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const id = params.id;
  const body = await req.json().catch(() => ({} as any));

  if (body.action === "set_default") {
    try {
      await prisma.$transaction([
        prisma.addresses.updateMany({ where: { user_id: userId }, data: { is_default: false } }),
        prisma.addresses.updateMany({ where: { id, user_id: userId }, data: { is_default: true } }),
      ]);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "set_default failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const patch = normalize(body);
  try {
    if (patch.is_default) {
      await prisma.$transaction([
        prisma.addresses.updateMany({ where: { user_id: userId }, data: { is_default: false } }),
        prisma.addresses.updateMany({ where: { id, user_id: userId }, data: patch }),
      ]);
    } else {
      await prisma.addresses.updateMany({ where: { id, user_id: userId }, data: patch });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE — remove an address (MySQL, ownership-scoped).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const id = params.id;

  try {
    await prisma.addresses.deleteMany({ where: { id, user_id: userId } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
