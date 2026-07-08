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

import { prisma } from "@/lib/db/prisma";

const CACHE_TTL_MS = 60 * 1000;
let cached: { value: string[]; expiresAt: number } | null = null;

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
    const rows = await prisma.notification_recipients.findMany({
      where: { active: true },
      select: { email: true },
      orderBy: { email: "asc" },
    });
    const value = rows.map((r) => r.email);
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
