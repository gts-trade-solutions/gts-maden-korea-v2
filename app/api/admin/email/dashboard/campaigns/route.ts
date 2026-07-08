import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  let campaigns: any[];
  try {
    campaigns = jsonSafe(
      await prisma.email_campaign.findMany({
        orderBy: { created_at: "desc" },
        take: 50,
      })
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }

  const enriched = await Promise.all(
    (campaigns || []).map(async (c) => {
      const campaignId = c.id as string;

      let recs: {
        status: string;
        delivery_event: string | null;
        has_opened: boolean;
        has_clicked: boolean;
      }[];
      try {
        recs = await prisma.email_campaign_recipient.findMany({
          where: { campaign_id: campaignId },
          select: {
            status: true,
            delivery_event: true,
            has_opened: true,
            has_clicked: true,
          },
        });
      } catch (recErr) {
        console.error(recErr);
        return { ...c, stats: null };
      }

      let total = 0;
      let sent = 0;
      let failed = 0;
      let delivered = 0;
      let bounced = 0;
      let complaints = 0;
      let opened = 0;
      let clicked = 0;

      for (const row of recs || []) {
        total += 1;
        if (row.status === "sent") sent += 1;
        if (row.status === "failed") failed += 1;
        if (row.delivery_event === "delivered") delivered += 1;
        if (row.delivery_event === "bounce") bounced += 1;
        if (row.delivery_event === "complaint") complaints += 1;
        if (row.has_opened) opened += 1;
        if (row.has_clicked) clicked += 1;
      }

      return {
        ...c,
        stats: {
          total,
          sent,
          failed,
          delivered,
          bounced,
          complaints,
          opened,
          clicked,
        },
      };
    })
  );

  return NextResponse.json({ campaigns: enriched });
}
