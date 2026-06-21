// lib/admin/notifications.ts
//
// Helper for inserting admin notification rows. Called from every
// surface that should ping the admin bell — order placed, email-change
// requested, K-Partnership applied, contact submitted, etc.
//
// Best-effort: never throws. A failed insert silently no-ops so the
// originating action (user signup, order, etc.) never breaks because
// of a notification side-effect.

import { createServiceClient } from "@/lib/supabaseServer";

export type AdminNotificationType =
  | "order_placed"
  | "email_change_requested"
  | "kpartnership_requested"
  | "intl_order_requested"
  | "contact_submitted"
  | "payout_requested"
  | "user_signed_up"
  | "vendor_signed_up";

export type AdminNotificationSeverity = "info" | "warning" | "critical";

export type CreateNotificationOpts = {
  type: AdminNotificationType;
  title: string;
  body?: string | null;
  /** Admin-side relative URL to open on click (e.g. `/admin/orders/123`). */
  link?: string | null;
  severity?: AdminNotificationSeverity;
  /** Optional structured payload for future filtering / linking. */
  meta?: Record<string, unknown> | null;
  /** Optional originating user (customer / vendor). */
  createdBy?: string | null;
};

export async function createAdminNotification(
  opts: CreateNotificationOpts
): Promise<void> {
  try {
    const sb = createServiceClient();
    await sb.from("admin_notifications").insert({
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      link: opts.link ?? null,
      severity: opts.severity ?? "info",
      meta: opts.meta ?? null,
      created_by: opts.createdBy ?? null,
    });
  } catch (err) {
    console.error("[admin-notifications] insert failed:", err);
    /* swallow — never break the originating action */
  }
}
