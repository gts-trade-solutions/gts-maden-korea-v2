import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  try {
    const [campaignsCount, recipientsCount, unsubCount] = await Promise.all([
      prisma.email_campaign.count(),
      prisma.email_campaign_recipient.count(),
      prisma.email_unsubscribe.count(),
    ]);

    return NextResponse.json({
      campaigns: campaignsCount || 0,
      recipients: recipientsCount || 0,
      unsubscribed: unsubCount || 0,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load dashboard summary" },
      { status: 500 }
    );
  }
}
