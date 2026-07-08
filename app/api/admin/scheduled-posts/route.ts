export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin scheduled-posts read (MySQL/Prisma). Serves InstagramMediaPanel's
// "Scheduled Posts" list. Read-only; admin-gated.
//   GET ?platform=instagram&status=pending
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const params = new URL(req.url).searchParams;
  const platform = params.get("platform") || "instagram";
  const status = params.get("status") || "pending";
  try {
    const data = await prisma.social_scheduled_posts.findMany({
      where: { platform, status },
      select: {
        id: true,
        platform: true,
        message: true,
        media_url: true,
        media_type: true,
        scheduled_at: true,
        status: true,
        last_error: true,
        error_message: true,
        ig_media_id: true,
        posted_at: true,
        created_at: true,
        payload: true,
      },
      orderBy: { scheduled_at: "asc" },
    });
    return json({ ok: true, data: jsonSafe(data ?? []) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
