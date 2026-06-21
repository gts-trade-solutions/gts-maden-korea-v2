export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { mirrorTableToMysql } from "@/lib/data/mirror";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const TABLE_FOR_KIND: Record<string, string> = {
  product: "home_product_video_products",
  influencer: "home_influencer_video_products",
};

// Replace-all into the chosen video-products join table. Using the
// service-role admin client so we don't depend on the browser session
// being able to evaluate the table's RLS policies — the route's own
// admin auth check above is the gate.
export async function POST(req: Request) {
  const { error: authErr } = await requireAdmin(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const { kind, videoId, productIds } = body ?? {};

  const table = TABLE_FOR_KIND[kind];
  if (!table) return json({ ok: false, error: "INVALID_KIND" }, 400);
  if (typeof videoId !== "string" || !videoId)
    return json({ ok: false, error: "INVALID_VIDEO_ID" }, 400);
  if (!Array.isArray(productIds))
    return json({ ok: false, error: "INVALID_PRODUCT_IDS" }, 400);

  const admin = createAdminClient();

  // 1) drop existing rows for this video.
  const { error: delErr } = await admin
    .from(table)
    .delete()
    .eq("video_id", videoId);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);

  // 2) insert the new ordered set, deduped by product_id (defensive).
  const seen = new Set<string>();
  const rows = productIds
    .filter((id: unknown): id is string => typeof id === "string" && !!id)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((product_id, position) => ({ video_id: videoId, product_id, position }));

  if (rows.length === 0) {
    await mirrorTableToMysql(table).catch(() => {});
    return json({ ok: true, count: 0 });
  }

  const { error: insErr } = await admin.from(table).insert(rows);
  if (insErr) return json({ ok: false, error: insErr.message }, 500);

  // Dual-write: mirror the join table into MySQL (the home page reads which
  // products are attached to each video from MySQL).
  await mirrorTableToMysql(table).catch(() => {});

  return json({ ok: true, count: rows.length });
}
