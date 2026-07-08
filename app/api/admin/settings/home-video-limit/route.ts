export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import {
  bustHomeVideoLimitCache,
  HOME_VIDEO_LIMIT_BOUNDS,
} from "@/lib/storeSettings";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin GET/PATCH for the home video carousel cap.
// Editable at /admin/cms/product-video; reader is `getHomeVideoLimit()`
// in lib/storeSettings.ts (60s cache, busted here on every successful write).

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  let data;
  try {
    data = await prisma.store_settings.findFirst({
      select: { home_video_limit: true },
    });
  } catch (dbErr: any) {
    return json({ ok: false, error: dbErr?.message ?? "Read failed" }, 500);
  }
  return json(
    jsonSafe({
      ok: true,
      limit: Number(data?.home_video_limit ?? HOME_VIDEO_LIMIT_BOUNDS.default),
      bounds: HOME_VIDEO_LIMIT_BOUNDS,
    })
  );
}

// Body: { limit: number }
export async function PATCH(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const raw = Number(body.limit);
  if (
    !Number.isFinite(raw) ||
    raw < HOME_VIDEO_LIMIT_BOUNDS.min ||
    raw > HOME_VIDEO_LIMIT_BOUNDS.max
  ) {
    return json(
      {
        ok: false,
        error: `Limit must be an integer between ${HOME_VIDEO_LIMIT_BOUNDS.min} and ${HOME_VIDEO_LIMIT_BOUNDS.max}`,
      },
      400
    );
  }
  const value = Math.floor(raw);

  try {
    await prisma.store_settings.update({
      where: { id: 1 },
      data: {
        home_video_limit: value,
        updated_at: new Date(),
        updated_by: user!.id,
      },
    });
  } catch (upErr: any) {
    return json({ ok: false, error: upErr?.message ?? "Update failed" }, 500);
  }

  // Drop the 60s in-process cache AND tell the home route to re-render
  // so admins see the new cap immediately, not on the next ISR tick.
  bustHomeVideoLimitCache();
  revalidatePath("/");

  return json({ ok: true, limit: value });
}
