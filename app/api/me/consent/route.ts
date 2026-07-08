export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// POST /api/me/consent { analytics: boolean }
// Persists the visitor's analytics tracking-consent onto profiles.tracking_consent
// so it follows them across devices (razorpay/verify reads it to gate event
// logging). Identity via NextAuth session; write via Prisma. Guests no-op (their
// consent lives only in the cookie). Best-effort.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return json({ ok: true, guest: true });

  const body = await req.json().catch(() => ({} as any));
  if (typeof body?.analytics !== "boolean") return json({ ok: false, error: "BAD_INPUT" }, 400);

  try {
    await prisma.profiles.updateMany({ where: { id: user.id }, data: { tracking_consent: body.analytics } });
  } catch (e) {
    console.error("[me/consent] persist failed:", e);
  }
  return json({ ok: true });
}
