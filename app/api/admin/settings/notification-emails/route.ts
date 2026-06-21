export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { bustAdminRecipientsCache } from "@/lib/notificationRecipients";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin CRUD for `notification_recipients`. The reader
// (`getAdminRecipientEmails`) caches for 60s so this endpoint
// invalidates that cache on every write — admins see edits land on
// the next email send instead of waiting for TTL.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = admin();
  const { data, error: dbErr } = await sb
    .from("notification_recipients")
    .select("id, email, label, active, created_at, updated_at")
    .order("email", { ascending: true });
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);
  return json({ ok: true, recipients: data ?? [] });
}

// Add a new recipient. Body: { email, label? }
export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  const label = body.label ? String(body.label).slice(0, 100) : null;

  if (!email || !isValidEmail(email)) {
    return json({ ok: false, error: "INVALID_EMAIL" }, 400);
  }

  const sb = admin();
  const { error: upErr } = await sb
    .from("notification_recipients")
    .upsert({ email, label, active: true }, { onConflict: "email" });

  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  bustAdminRecipientsCache();
  return json({ ok: true });
}

// Toggle active flag. Body: { id, active }
export async function PATCH(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const active = !!body.active;
  if (!id) return json({ ok: false, error: "MISSING_ID" }, 400);

  const sb = admin();
  const { error: upErr } = await sb
    .from("notification_recipients")
    .update({ active })
    .eq("id", id);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  bustAdminRecipientsCache();
  return json({ ok: true });
}

// Remove a recipient. URL: ?id=...
export async function DELETE(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "MISSING_ID" }, 400);

  const sb = admin();
  const { error: delErr } = await sb
    .from("notification_recipients")
    .delete()
    .eq("id", id);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);

  bustAdminRecipientsCache();
  return json({ ok: true });
}
