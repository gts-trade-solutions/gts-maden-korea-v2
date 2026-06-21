import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUserId } from "@/lib/auth/identity";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

const ADDR_SELECT = "id, name, phone, email, line1, line2, landmark, city, state, pincode, country, is_default";

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

// GET — list the user's addresses (MySQL behind the flag, Supabase fallback).
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  if (process.env.CATALOG_BACKEND === "mysql") {
    const { prisma } = await import("@/lib/db/prisma");
    const rows = await prisma.addresses.findMany({
      where: { user_id: userId },
      select: { id: true, name: true, phone: true, email: true, line1: true, line2: true, landmark: true, city: true, state: true, pincode: true, country: true, is_default: true },
      orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
    });
    return NextResponse.json({ addresses: jsonSafe(rows) });
  }
  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { data } = await sb.from("addresses").select(ADDR_SELECT).eq("user_id", userId)
    .order("is_default", { ascending: false }).order("created_at", { ascending: false });
  return NextResponse.json({ addresses: data ?? [] });
}

// POST — create an address. Dual-write with a shared id so both DBs agree.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const row = normalize(await req.json().catch(() => ({})));
  const id = randomUUID();

  const { supabaseForUser } = await import("@/lib/supabaseRoute");
  const sb = supabaseForUser(userId);
  const { error: sbErr } = await sb.from("addresses").insert({ id, user_id: userId, ...row });
  if (sbErr) return NextResponse.json({ error: sbErr.message }, { status: 500 });

  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.addresses.create({ data: { id, user_id: userId, ...row } });
  } catch (e) {
    console.error("[dual-write] address create MySQL failed:", e);
  }
  return NextResponse.json({ ok: true, id });
}
