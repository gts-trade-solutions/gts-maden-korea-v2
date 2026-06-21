import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";

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

async function getValidTokenRow(supabase: any, token: string) {
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("password_reset_tokens")
    .select("id, email, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

async function findAuthUserByEmail(supabase: any, email: string) {
  const target = email.toLowerCase();
  const perPage = 200;
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find(
      (u: any) => (u?.email || "").toLowerCase() === target
    );
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")?.trim();
    if (!token) {
      return NextResponse.json({ ok: true, valid: false });
    }

    const supabase = createServiceClient();
    const row = await getValidTokenRow(supabase, token);

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

    const supabase = createServiceClient();
    const row = await getValidTokenRow(supabase, token);

    if (!row?.email) {
      return NextResponse.json(
        { ok: false, error: "Reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    const user = await findAuthUserByEmail(supabase as any, row.email);
    if (!user?.id) {
      return NextResponse.json(
        { ok: false, error: "Reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    const { error: updateErr } = await (supabase as any).auth.admin.updateUserById(
      user.id,
      { password }
    );

    if (updateErr) {
      console.error("[reset-password][POST] update user failed:", updateErr);
      return NextResponse.json(
        { ok: false, error: "Could not reset password right now." },
        { status: 500 }
      );
    }

    // Dual-write: also update the MySQL credential hash that NextAuth verifies
    // (prisma.user.passwordHash, read in authOptions.authorize). The Supabase
    // update above only touches Supabase Auth — under AUTH_BACKEND=nextauth the
    // login path checks the MySQL hash, so without this the user would stay
    // locked to their pre-reset password. ids were kept in sync at migration,
    // but we match on email to be robust.
    try {
      const bcrypt = (await import("bcryptjs")).default;
      const { prisma } = await import("@/lib/db/prisma");
      const passwordHash = await bcrypt.hash(password, 10);
      const res = await prisma.user.updateMany({
        where: { email: row.email.toLowerCase() },
        data: { passwordHash },
      });
      if (res.count === 0) {
        console.error("[reset-password][POST] MySQL hash sync matched 0 rows for", row.email);
      }
    } catch (e) {
      console.error("[reset-password][POST] MySQL hash sync failed:", e);
    }

    const { error: consumeErr } = await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);

    if (consumeErr) {
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
