import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { createAdminClient } from "@/lib/supabaseAdmin";

// Dual-write signup for the transition period.
//
// The vendor app still authenticates against Supabase Auth, so Supabase
// auth.users must stay complete until BOTH apps are off Supabase. So a new
// registration is written to BOTH identity stores with the SAME id:
//   • Supabase Auth (admin.createUser) — canonical id source + keeps the vendor
//     app able to see/authenticate the user; its handle_new_user trigger also
//     creates the Supabase profiles row.
//   • MySQL `auth_users` (bcrypt hash, for NextAuth credentials) + `profiles`.
// If the MySQL half fails, the Supabase user is rolled back so we never leave a
// half-created account. Same plaintext password feeds both hashes, so the user
// can log in via Supabase (vendor app) AND NextAuth (this app).
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

  // Fast pre-check against MySQL (the Supabase create also enforces uniqueness).
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
  }

  const admin = createAdminClient();

  // 1) Supabase Auth — canonical id. Trigger creates the Supabase profiles row.
  const { data: created, error: sErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (sErr || !created?.user) {
    const msg = sErr?.message || "SUPABASE_CREATE_FAILED";
    const taken = /already|exists|registered/i.test(msg);
    return NextResponse.json(
      { error: taken ? "EMAIL_EXISTS" : "SUPABASE_CREATE_FAILED" },
      { status: taken ? 409 : 500 }
    );
  }
  const id = created.user.id;

  // 2) MySQL auth_users (NextAuth credentials) + profiles, SAME id.
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { id, email, name: fullName, passwordHash } });
    await prisma.profiles.upsert({
      where: { id },
      update: { full_name: fullName },
      create: { id, full_name: fullName },
    });
  } catch (e) {
    // Roll back the Supabase user — don't leave a half-created account.
    try {
      await admin.auth.admin.deleteUser(id);
    } catch (delErr) {
      console.error("[register] rollback deleteUser failed:", delErr);
    }
    console.error("[register] MySQL create failed:", e);
    return NextResponse.json({ error: "MYSQL_CREATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id });
}
