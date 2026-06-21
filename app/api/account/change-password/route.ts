export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/auth/routeUser";
import { requireEmailVerified } from "@/lib/auth/emailVerification";

// POST /api/account/change-password  { current, next }
//
// Server-side password change. The old client flow used supabase.auth
// (signInWithPassword + updateUser), which under AUTH_BACKEND=nextauth has no
// Supabase session and never touched the MySQL hash that NextAuth verifies. This
// route verifies `current` against prisma.user.passwordHash, updates that hash,
// and best-effort dual-writes Supabase Auth so both backends stay in sync.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({} as any));
  const current = String(body?.current ?? "");
  const next = String(body?.next ?? "");
  if (!current || next.length < 8) {
    return json({ ok: false, error: "Password must be at least 8 characters.", code: "BAD_INPUT" }, 400);
  }

  // Trust-required action — block unverified accounts (server-side gate, so a
  // stolen session can't lock out the legitimate owner before they verify).
  const block = await requireEmailVerified(user.id);
  if (block) {
    return json({ ok: false, error: block.message, code: "email_not_verified" }, 403);
  }

  const bcrypt = (await import("bcryptjs")).default;
  const { prisma } = await import("@/lib/db/prisma");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.passwordHash) {
    // No local hash (e.g. an OAuth-only account) — nothing to verify/replace here.
    return json({ ok: false, error: "Password change isn't available for this account.", code: "NO_PASSWORD" }, 400);
  }
  const okCurrent = await bcrypt.compare(current, dbUser.passwordHash);
  if (!okCurrent) {
    return json({ ok: false, error: "Current password is incorrect.", code: "INCORRECT_PASSWORD" }, 400);
  }

  const passwordHash = await bcrypt.hash(next, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  // Dual-write Supabase Auth so the password also works if anything still reads
  // the Supabase backend during the migration window. Best-effort.
  try {
    const { createServiceClient } = await import("@/lib/supabaseServer");
    const sb = createServiceClient();
    await sb.auth.admin.updateUserById(user.id, { password: next } as any);
  } catch (e) {
    console.error("[change-password] Supabase dual-write failed:", e);
  }

  return json({ ok: true });
}
