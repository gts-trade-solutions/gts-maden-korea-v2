export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin scheduled-posts read (service-role). Replaces the browser anon Supabase
// read in InstagramMediaPanel's "Scheduled Posts" list so RLS can be enabled on
// `social_scheduled_posts`. Read-only; admin-gated.
//   GET ?platform=instagram&status=pending
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const params = new URL(req.url).searchParams;
  const platform = params.get("platform") || "instagram";
  const status = params.get("status") || "pending";
  try {
    const { data, error: e } = await admin()
      .from("social_scheduled_posts")
      .select(
        "id, platform, message, media_url, media_type, scheduled_at, status, last_error, error_message, ig_media_id, posted_at, created_at, payload"
      )
      .eq("platform", platform)
      .eq("status", status)
      .order("scheduled_at", { ascending: true });
    if (e) return json({ ok: false, error: e.message }, 500);
    return json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
