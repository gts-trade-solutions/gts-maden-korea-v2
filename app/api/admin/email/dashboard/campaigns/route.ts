import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const supabase = createServiceClient();

  const { data: campaigns, error } = await supabase
    .from("email_campaign")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }

  const enriched = await Promise.all(
    (campaigns || []).map(async (c) => {
      const campaignId = c.id as string;

      const { data: recs, error: recErr } = await supabase
  .from("email_campaign_recipient")
  .select(
    `
    status,
    delivery_event,
    has_opened,
    has_clicked
  `
  )
  .eq("campaign_id", campaignId);

if (recErr) {
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
