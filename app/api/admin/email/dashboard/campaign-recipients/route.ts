import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const campaignId = req.nextUrl.searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 }
    );
  }

  try {
    const data = await prisma.email_campaign_recipient.findMany({
      where: { campaign_id: campaignId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        sent_at: true,
        error: true,
        ses_message_id: true,
        delivery_event: true,
        delivery_event_at: true,
        has_opened: true,
        opened_at: true,
        has_clicked: true,
        clicked_at: true,
      },
      orderBy: { email: "asc" },
    });

    return NextResponse.json({ recipients: jsonSafe(data) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch recipients" },
      { status: 500 }
    );
  }
}
