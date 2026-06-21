export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
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


function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const sb = admin();
  const { data, error: dbErr } = await sb
    .from("store_settings")
    .select("home_video_limit")
    .eq("id", 1)
    .maybeSingle();
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);
  return json({
    ok: true,
    limit: Number(data?.home_video_limit ?? HOME_VIDEO_LIMIT_BOUNDS.default),
    bounds: HOME_VIDEO_LIMIT_BOUNDS,
  });
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

  const sb = admin();
  const { error: upErr } = await sb
    .from("store_settings")
    .update({
      home_video_limit: value,
      updated_at: new Date().toISOString(),
      updated_by: user!.id,
    })
    .eq("id", 1);
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  // Drop the 60s in-process cache AND tell the home route to re-render
  // so admins see the new cap immediately, not on the next ISR tick.
  bustHomeVideoLimitCache();
  revalidatePath("/");

  // Dual-write: getHomeVideoLimit reads home_video_limit from MySQL under
  // CATALOG_BACKEND=mysql, so a Supabase-only update never caps the storefront.
  try {
    const { mirrorTableToMysql } = await import("@/lib/data/mirror");
    await mirrorTableToMysql("store_settings");
  } catch (e) {
    console.error("[dual-write] home-video-limit MySQL mirror failed:", e);
  }

  return json({ ok: true, limit: value });
}
