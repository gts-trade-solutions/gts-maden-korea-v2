export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { bustAdminRecipientsCache } from "@/lib/notificationRecipients";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin CRUD for `notification_recipients`. The reader
// (`getAdminRecipientEmails`) caches for 60s so this endpoint
// invalidates that cache on every write — admins see edits land on
// the next email send instead of waiting for TTL.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  let data;
  try {
    data = await prisma.notification_recipients.findMany({
      select: {
        id: true,
        email: true,
        label: true,
        active: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { email: "asc" },
    });
  } catch (dbErr: any) {
    return json({ ok: false, error: dbErr?.message ?? "Read failed" }, 500);
  }
  return json({ ok: true, recipients: jsonSafe(data ?? []) });
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

  try {
    await prisma.notification_recipients.upsert({
      where: { email },
      update: { label, active: true },
      create: { id: randomUUID(), email, label, active: true },
    });
  } catch (upErr: any) {
    return json({ ok: false, error: upErr?.message ?? "Update failed" }, 500);
  }

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

  try {
    await prisma.notification_recipients.updateMany({
      where: { id },
      data: { active },
    });
  } catch (upErr: any) {
    return json({ ok: false, error: upErr?.message ?? "Update failed" }, 500);
  }

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

  try {
    await prisma.notification_recipients.deleteMany({ where: { id } });
  } catch (delErr: any) {
    return json({ ok: false, error: delErr?.message ?? "Delete failed" }, 500);
  }

  bustAdminRecipientsCache();
  return json({ ok: true });
}
