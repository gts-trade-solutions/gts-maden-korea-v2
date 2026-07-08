export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin read for the published-posts dropdown on /admin/instagram/comments.
// Served from MySQL (Prisma) behind requireAdmin. Only rows that already have
// an instagram_media_id are returned; the page still applies its own
// status === "published" filter.
export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  try {
    const data = await prisma.campaign_posts.findMany({
      where: { instagram_media_id: { not: null } },
      select: {
        id: true,
        caption: true,
        status: true,
        instagram_media_id: true,
        published_at: true,
      },
      orderBy: { published_at: "desc" },
    });
    return NextResponse.json(
      { ok: true, data: jsonSafe(data) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
