import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { grant } from "@/lib/integrations/skinEntitlement";
import { sendEmail } from "@/lib/ses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://madenkorea.com";

// Approve → grant one more analysis + notify the user. Deny → mark denied.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }

  const request = await prisma.skinAccessRequest.findUnique({
    where: { id: params.id },
  });
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (request.status !== "pending") {
    return NextResponse.json(
      { error: "already_reviewed", status: request.status },
      { status: 409 },
    );
  }

  await prisma.skinAccessRequest.update({
    where: { id: params.id },
    data: {
      status: action === "approve" ? "approved" : "denied",
      reviewedBy: user?.id ?? null,
      reviewedAt: new Date(),
    },
  });

  if (action === "approve") {
    await grant(request.userId, "granted");

    // Best-effort notify (never blocks the approval).
    const u = await prisma.user.findUnique({
      where: { id: request.userId },
      select: { email: true, name: true },
    });
    if (u?.email) {
      sendEmail({
        to: u.email,
        subject: "Your skin analysis is ready",
        html: `<p>Hi ${u.name ?? "there"},</p>
<p>Good news — we've enabled another AI skin analysis on your MadeNKorea account.</p>
<p><a href="${SITE_URL}/skin-analyzer">Analyze your skin →</a></p>`,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
