import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

async function isAdmin(userId: string): Promise<boolean> {
  const { prisma } = await import("@/lib/db/prisma");
  const p = await prisma.profiles.findUnique({ where: { id: userId }, select: { role: true } });
  return p?.role === "admin" || p?.role === "super_admin";
}

// PATCH — owner edit (rating/title/body/photos) OR admin status change
// ({ action:"set_status", status }). Dual-write: Supabase first (RLS), MySQL best-effort.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const id = params.id;
  const payload = await req.json().catch(() => ({} as any));

  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { prisma } = await import("@/lib/db/prisma");

  if (payload.action === "set_status") {
    if (!(await isAdmin(userId))) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    const status = payload.status === "hidden" ? "hidden" : "published";
    const { error } = await sb.from("product_reviews").update({ status }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    try { await prisma.product_reviews.updateMany({ where: { id }, data: { status } }); }
    catch (e) { console.error("[dual-write] review status MySQL failed:", e); }
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
  const { error } = await sb.from("product_reviews").update(patch).eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  try { await prisma.product_reviews.updateMany({ where: { id, user_id: userId }, data: patch }); }
  catch (e) { console.error("[dual-write] review edit MySQL failed:", e); }
  return NextResponse.json({ ok: true });
}

// DELETE — owner or admin. Dual-write.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const id = params.id;
  const admin = await isAdmin(userId);

  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { prisma } = await import("@/lib/db/prisma");

  let q = sb.from("product_reviews").delete().eq("id", id);
  if (!admin) q = q.eq("user_id", userId);
  const { error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  try { await prisma.product_reviews.deleteMany({ where: admin ? { id } : { id, user_id: userId } }); }
  catch (e) { console.error("[dual-write] review delete MySQL failed:", e); }
  return NextResponse.json({ ok: true });
}
