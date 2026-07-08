import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only contact subscribe/resubscribe toggle (called from the admin email
// contacts UI). NOTE: this is NOT the public unsubscribe link — that's the
// separate, unauthenticated /api/email/unsubscribe endpoint. This one can also
// RE-subscribe (delete an opt-out), so it must be admin-gated.
type Body = {
  email: string;
  unsubscribed: boolean;
};

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAdmin(req);
  if (authErr) return authErr;

  const { email, unsubscribed }: Body = await req.json();

  if (!email) {
    return NextResponse.json(
      { error: "Email is required" },
      { status: 400 }
    );
  }

  const emailLower = email.trim().toLowerCase();

  if (unsubscribed) {
    try {
      await prisma.email_unsubscribe.upsert({
        where: { email: emailLower },
        update: { source: "admin" },
        create: { id: randomUUID(), email: emailLower, source: "admin" },
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to unsubscribe email" },
        { status: 500 }
      );
    }
  } else {
    try {
      await prisma.email_unsubscribe.deleteMany({
        where: { email: emailLower },
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to resubscribe email" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(jsonSafe({ success: true }));
}
