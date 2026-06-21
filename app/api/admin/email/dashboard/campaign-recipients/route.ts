import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const supabase = createServiceClient();
  const campaignId = req.nextUrl.searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
  .from("email_campaign_recipient")
  .select(
    `
    id,
    email,
    name,
    status,
    sent_at,
    error,
    ses_message_id,
    delivery_event,
    delivery_event_at,
    has_opened,
    opened_at,
    has_clicked,
    clicked_at
  `
  )
  .eq("campaign_id", campaignId)
  .order("email", { ascending: true });


  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch recipients" },
      { status: 500 }
    );
  }

  return NextResponse.json({ recipients: data });
}
