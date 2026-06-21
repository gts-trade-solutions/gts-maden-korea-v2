// Admin notification recipient list.
//
// Replaces hardcoded `ADMIN_EMAILS` in razorpay/verify and the
// `cc: ["operations@madenkorea.com"]` sprinkled across contact /
// payouts / international-order routes. Admins manage the list at
// /admin/settings/notification-emails.
//
// Reader is short-cached (60s) so a busy hour of orders doesn't fan
// out into one DB hit per send. The admin write endpoint invalidates
// the cache so changes propagate within that TTL anyway.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const CACHE_TTL_MS = 60 * 1000;
let cached: { value: string[]; expiresAt: number } | null = null;

function client() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Returns the active list of admin notification email addresses, in
 * alphabetical order. Empty array if the table is unreachable — the
 * email-sending routes treat that as "no admin notification, but the
 * customer email still goes out".
 */
export async function getAdminRecipientEmails(): Promise<string[]> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const sb = client();
    const { data, error } = await sb
      .from("notification_recipients")
      .select("email")
      .eq("active", true)
      .order("email", { ascending: true });
    if (error || !data) {
      cached = { value: [], expiresAt: now + CACHE_TTL_MS };
      return [];
    }
    const value = (data as Array<{ email: string }>).map((r) => r.email);
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cached = { value: [], expiresAt: now + CACHE_TTL_MS };
    return [];
  }
}

/** Drop the in-process cache. Called by the admin POST/DELETE endpoint
    so edits show up on the next send, not 60 seconds later. */
export function bustAdminRecipientsCache() {
  cached = null;
}
