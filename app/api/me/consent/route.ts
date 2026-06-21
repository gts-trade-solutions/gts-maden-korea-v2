export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/auth/routeUser";
import { supabaseForUser } from "@/lib/supabaseRoute";

// POST /api/me/consent { analytics: boolean }
// Persists the visitor's analytics tracking-consent onto profiles.tracking_consent
// so it follows them across devices (razorpay/verify reads it to gate event
// logging). The client used to write this via supabase.auth.getSession(), which
// is null under NextAuth; this routes it through the service-role seam. Guests
// no-op (their consent lives only in the cookie). Best-effort + dual-write.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return json({ ok: true, guest: true });

  const body = await req.json().catch(() => ({} as any));
  if (typeof body?.analytics !== "boolean") return json({ ok: false, error: "BAD_INPUT" }, 400);

  try {
    const sb = supabaseForUser(user.id);
    await sb.from("profiles").update({ tracking_consent: body.analytics }).eq("id", user.id);
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.profiles.updateMany({ where: { id: user.id }, data: { tracking_consent: body.analytics } });
  } catch (e) {
    console.error("[me/consent] persist failed:", e);
  }
  return json({ ok: true });
}
