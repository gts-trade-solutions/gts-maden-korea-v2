import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const supabase = createServiceClient();

  const { count: campaignsCount, error: cErr } = await supabase
    .from("email_campaign")
    .select("id", { count: "exact", head: true });

  const { count: recipientsCount, error: rErr } = await supabase
    .from("email_campaign_recipient")
    .select("id", { count: "exact", head: true });

  const { count: unsubCount, error: uErr } = await supabase
    .from("email_unsubscribe")
    .select("id", { count: "exact", head: true });

  if (cErr || rErr || uErr) {
    console.error(cErr || rErr || uErr);
    return NextResponse.json(
      { error: "Failed to load dashboard summary" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    campaigns: campaignsCount || 0,
    recipients: recipientsCount || 0,
    unsubscribed: unsubCount || 0,
  });
}
