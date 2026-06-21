import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/identity";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET reads the profile (MySQL behind the flag, Supabase fallback).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  if (process.env.CATALOG_BACKEND === "mysql") {
    const { prisma } = await import("@/lib/db/prisma");
    const p = await prisma.profiles.findUnique({
      where: { id: userId },
      select: { full_name: true, avatar_url: true, phone: true },
    });
    return NextResponse.json({ profile: jsonSafe(p) });
  }
  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { data } = await sb.from("profiles").select("full_name, avatar_url, phone").eq("id", userId).maybeSingle();
  return NextResponse.json({ profile: data });
}

// PATCH dual-writes profile fields: Supabase first (still authoritative for
// un-migrated flows), then MySQL best-effort. Drop the Supabase write once all
// profile consumers are on MySQL (Phase E).
export async function PATCH(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const patch: Record<string, any> = {};
  if (typeof body.full_name === "string") patch.full_name = body.full_name;
  if (typeof body.phone === "string") patch.phone = body.phone;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { error: sbErr } = await sb.from("profiles").update(patch).eq("id", userId);
  if (sbErr) return NextResponse.json({ error: sbErr.message }, { status: 500 });

  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.profiles.update({ where: { id: userId }, data: patch });
  } catch (e) {
    console.error("[dual-write] profile MySQL update failed:", e);
  }
  return NextResponse.json({ ok: true });
}
