export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Admin banner list read, MySQL-authoritative (Prisma). Mirrors the old
// browser Supabase select in app/admin/cms/banners/page.tsx:
//   filter page_scope (?scope=, default "home") + optional country
//   (?country=, "all" or omitted = every country), ordered country asc
//   then position asc. Writes still flow through adminWrite.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") || "home";
  const country = url.searchParams.get("country");

  try {
    const banners = await prisma.home_banners.findMany({
      where: {
        page_scope: scope,
        ...(country && country !== "all" ? { country } : {}),
      },
      select: {
        id: true,
        alt: true,
        image_path: true,
        video_url: true,
        link_url: true,
        page_scope: true,
        position: true,
        active: true,
        starts_at: true,
        ends_at: true,
        country: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: [{ country: "asc" }, { position: "asc" }],
    });
    return json({ ok: true, banners: jsonSafe(banners) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}
