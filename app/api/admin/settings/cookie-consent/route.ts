// /api/admin/settings/cookie-consent
//
// GET  — returns { delaySeconds }
// POST — updates the column on store_settings (admin only).
//
// Bounded server-side: 1..60 seconds.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
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
  const data = await prisma.store_settings.findFirst({
    select: {
      cookie_consent_delay_seconds: true,
      cookie_consent_scroll_threshold: true,
    },
  });
  return json(
    jsonSafe({
      ok: true,
      delaySeconds: clampDelay(data?.cookie_consent_delay_seconds ?? 7),
      scrollThreshold: clampScroll(data?.cookie_consent_scroll_threshold ?? 1),
    })
  );
}

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const delaySeconds = clampDelay(body?.delaySeconds);
  const scrollThreshold = clampScroll(body?.scrollThreshold);

  try {
    await prisma.store_settings.update({
      where: { id: 1 },
      data: {
        cookie_consent_delay_seconds: delaySeconds,
        cookie_consent_scroll_threshold: scrollThreshold,
      },
    });
  } catch (upErr: any) {
    return json({ ok: false, error: upErr?.message ?? "Update failed" }, 500);
  }

  return json({ ok: true, delaySeconds, scrollThreshold });
}
