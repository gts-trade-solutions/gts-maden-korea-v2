// /api/admin/settings/email-verification
//
// GET  → returns { graceDays, lockoutDays }
// POST → updates the two columns on store_settings (admin only).
//
// Days are bounded server-side: grace 1..90, lockout 1..365. Ensures
// the UI can't push pathological values that effectively disable
// gating or lock everyone out instantly.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getEmailVerificationConfig } from "@/lib/auth/emailVerification";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const dynamic = "force-dynamic";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const cfg = await getEmailVerificationConfig();
  return json({ ok: true, ...cfg });
}

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const graceDays = clampInt(body?.graceDays, 1, 90, 7);
  const lockoutDays = clampInt(body?.lockoutDays, 1, 365, 30);

  if (graceDays > lockoutDays) {
    return json(
      { ok: false, error: "Grace days must be less than or equal to lockout days." },
      400
    );
  }

  const { error: upErr } = await supabase
    .from("store_settings")
    .update({
      email_verification_grace_days: graceDays,
      email_verification_lockout_days: lockoutDays,
    })
    .eq("id", 1);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  return json({ ok: true, graceDays, lockoutDays });
}
