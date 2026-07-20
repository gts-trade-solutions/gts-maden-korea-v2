import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

async function isAdmin(userId: string): Promise<boolean> {
  const { prisma } = await import("@/lib/db/prisma");
  const p = await prisma.profiles.findUnique({ where: { id: userId }, select: { role: true } });
  return p?.role === "admin" || p?.role === "super_admin";
}

// PATCH — owner edit (rating/title/body/photos) OR admin status change
// ({ action:"set_status", status }). MySQL only; ownership is enforced in the
// WHERE clause (updateMany matching 0 rows => 404) now that RLS is gone.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const id = params.id;
  const payload = await req.json().catch(() => ({} as any));

  const { prisma } = await import("@/lib/db/prisma");

  if (payload.action === "set_status") {
    if (!(await isAdmin(userId))) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    const status = payload.status === "hidden" ? "hidden" : "published";
    try {
      const res = await prisma.product_reviews.updateMany({ where: { id }, data: { status } });
      if (res.count === 0) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message || "UPDATE_FAILED" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const patch = {
    rating: Number(payload.rating),
    title: payload.title ?? null,
    body: payload.body ?? null,
    photos: Array.isArray(payload.photos) ? payload.photos : [],
    display_name: payload.display_name ?? null,
    avatar_url: payload.avatar_url ?? null,
  };
  try {
    const res = await prisma.product_reviews.updateMany({ where: { id, user_id: userId }, data: patch });
    if (res.count === 0) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "UPDATE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE — owner or admin. MySQL only; non-admins are scoped to their own row.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const id = params.id;
  const admin = await isAdmin(userId);

  const { prisma } = await import("@/lib/db/prisma");
  try {
    const res = await prisma.product_reviews.deleteMany({
      where: admin ? { id } : { id, user_id: userId },
    });
    if (res.count === 0) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "DELETE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
