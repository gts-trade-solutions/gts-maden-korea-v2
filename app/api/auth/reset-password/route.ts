import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function passwordIsValid(password: string) {
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9\s]/.test(password);
  return password.length >= 8 && hasUpper && hasNumber && hasSymbol;
}

// Returns the still-valid (unused, unexpired) reset-token row for a raw token,
// or null. Reads from MySQL (Prisma `password_reset_tokens`).
async function getValidTokenRow(token: string) {
  const tokenHash = hashToken(token);
  try {
    const row = await prisma.password_reset_tokens.findFirst({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      select: { id: true, email: true, expires_at: true, used_at: true },
    });
    return row ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")?.trim();
    if (!token) {
      return NextResponse.json({ ok: true, valid: false });
    }

    const row = await getValidTokenRow(token);

    return NextResponse.json({ ok: true, valid: !!row });
  } catch (error) {
    console.error("[reset-password][GET] unexpected error:", error);
    return NextResponse.json({ ok: true, valid: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    if (!passwordIsValid(password)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Password must be at least 8 characters and include uppercase, number, and symbol.",
        },
        { status: 400 }
      );
    }

    const row = await getValidTokenRow(token);

    if (!row?.email) {
      return NextResponse.json(
        { ok: false, error: "Reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    // Set the new credential hash on the MySQL account NextAuth verifies
    // (prisma.user.passwordHash, read in authOptions.authorize). Match on email
    // — matches how registration / the previous dual-write keyed the account.
    // bcryptjs with 10 salt rounds, identical to /api/auth/register.
    const passwordHash = await bcrypt.hash(password, 10);
    const res = await prisma.user.updateMany({
      where: { email: row.email.toLowerCase() },
      data: { passwordHash },
    });

    if (res.count === 0) {
      // Token was valid but no account carries that email — treat as an
      // invalid/expired link rather than exposing account existence.
      console.error("[reset-password][POST] no auth_users row for", row.email);
      return NextResponse.json(
        { ok: false, error: "Reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    // Consume the token so the link can't be replayed. Best-effort — the
    // password is already updated above.
    try {
      await prisma.password_reset_tokens.update({
        where: { id: row.id },
        data: { used_at: new Date() },
      });
    } catch (consumeErr) {
      console.error("[reset-password][POST] consume token failed:", consumeErr);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reset-password][POST] unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "Could not reset password right now." },
      { status: 500 }
    );
  }
}
