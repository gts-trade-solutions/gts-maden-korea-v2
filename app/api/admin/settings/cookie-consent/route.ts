// /api/admin/settings/cookie-consent
//
// GET  — returns { delaySeconds }
// POST — updates the column on store_settings (admin only).
//
// Bounded server-side: 1..60 seconds.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function clampDelay(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 7;
  return Math.max(1, Math.min(60, Math.floor(n)));
}

function clampScroll(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("store_settings")
    .select(
      "cookie_consent_delay_seconds, cookie_consent_scroll_threshold"
    )
    .eq("id", 1)
    .maybeSingle();
  return json({
    ok: true,
    delaySeconds: clampDelay(data?.cookie_consent_delay_seconds ?? 7),
    scrollThreshold: clampScroll(data?.cookie_consent_scroll_threshold ?? 1),
  });
}

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const delaySeconds = clampDelay(body?.delaySeconds);
  const scrollThreshold = clampScroll(body?.scrollThreshold);

  const { error: upErr } = await supabase
    .from("store_settings")
    .update({
      cookie_consent_delay_seconds: delaySeconds,
      cookie_consent_scroll_threshold: scrollThreshold,
    })
    .eq("id", 1);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  return json({ ok: true, delaySeconds, scrollThreshold });
}
