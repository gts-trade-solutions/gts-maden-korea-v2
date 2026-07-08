export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Admin influencer-video list read, MySQL-authoritative (Prisma). Mirrors
// the old browser Supabase `select("*")` in
// app/admin/cms/influencer-video/page.tsx: filter page_scope (?scope=,
// default "home"), ordered position asc. Writes still flow through adminWrite.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const scope = new URL(req.url).searchParams.get("scope") || "home";

  try {
    const videos = await prisma.home_influencer_videos.findMany({
      where: { page_scope: scope },
      orderBy: { position: "asc" },
    });
    return json({ ok: true, videos: jsonSafe(videos) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
