import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";

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
// Dual-write (Supabase first, MySQL best-effort). MySQL uses updateMany scoped
// to (id, user_id) for ownership + so a not-yet-present row doesn't throw.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const id = params.id;
  const body = await req.json().catch(() => ({} as any));

  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { prisma } = await import("@/lib/db/prisma");

  if (body.action === "set_default") {
    // Supabase: prefer the RPC, fall back to manual rebase.
    const { error } = await sb.rpc("rebase_default_address", { p_user_id: userId, p_address_id: id });
    if (error) {
      await sb.from("addresses").update({ is_default: false }).eq("user_id", userId);
      await sb.from("addresses").update({ is_default: true }).eq("id", id).eq("user_id", userId);
    }
    try {
      await prisma.$transaction([
        prisma.addresses.updateMany({ where: { user_id: userId }, data: { is_default: false } }),
        prisma.addresses.updateMany({ where: { id, user_id: userId }, data: { is_default: true } }),
      ]);
    } catch (e) {
      console.error("[dual-write] set_default MySQL failed:", e);
    }
    return NextResponse.json({ ok: true });
  }

  const patch = normalize(body);
  const { error: sbErr } = await sb.from("addresses").update(patch).eq("id", id).eq("user_id", userId);
  if (sbErr) return NextResponse.json({ error: sbErr.message }, { status: 500 });
  try {
    await prisma.addresses.updateMany({ where: { id, user_id: userId }, data: patch });
  } catch (e) {
    console.error("[dual-write] address update MySQL failed:", e);
  }
  return NextResponse.json({ ok: true });
}

// DELETE — remove an address (dual-write, ownership-scoped).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const id = params.id;

  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { error: sbErr } = await sb.from("addresses").delete().eq("id", id).eq("user_id", userId);
  if (sbErr) return NextResponse.json({ error: sbErr.message }, { status: 500 });
  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.addresses.deleteMany({ where: { id, user_id: userId } });
  } catch (e) {
    console.error("[dual-write] address delete MySQL failed:", e);
  }
  return NextResponse.json({ ok: true });
}
