import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

// Registration — NextAuth/MySQL only (post-Supabase).
//
// Creates the account in MySQL with a single generated id shared across both
// identity rows:
//   • `auth_users` (Prisma model `User`) — bcrypt hash for NextAuth credentials.
//   • `profiles` — the app-facing profile row, same id.
// bcrypt rounds = 10 to match lib/auth/authOptions.ts so migrated and freshly
// created hashes verify identically.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const email = String(body?.email ?? "").toLowerCase().trim();
  const password = String(body?.password ?? "");
  const fullName = body?.full_name ? String(body.full_name).trim() : null;

  if (!email || !password) {
    return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
  }

  // Uniqueness pre-check against the NextAuth user table.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
  }

  const id = randomUUID();

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { id, email, name: fullName, passwordHash } });
    await prisma.profiles.upsert({
      where: { id },
      update: { full_name: fullName },
      // Start the email-verification grace clock at signup. Without this the
      // status computation falls back to "now" on every read, so the user
      // never progresses soft → warning → locked and the countdown is fake.
      create: {
        id,
        full_name: fullName,
        email_verification_grace_starts_at: new Date(),
      },
    });
  } catch (e) {
    console.error("[register] MySQL create failed:", e);
    return NextResponse.json({ error: "MYSQL_CREATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}
