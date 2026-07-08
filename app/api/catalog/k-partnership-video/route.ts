import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

// GET /api/catalog/k-partnership-video?country=IN
// The K-Partnership explainer video path for the visitor's country, falling
// back to the admin-selected default country (store_settings). Returns
// { storage_path: string | null } from MySQL. Read-only, public.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const country = (searchParams.get("country") || "").trim();

  let row = country
    ? await prisma.k_partnership_videos.findFirst({
        where: { country_code: country },
        select: { storage_path: true },
      })
    : null;

  if (!row) {
    const settings = await prisma.store_settings.findFirst({
      select: { k_partnership_default_country: true },
    });
    const fallback = settings?.k_partnership_default_country;
    if (fallback) {
      row = await prisma.k_partnership_videos.findFirst({
        where: { country_code: fallback },
        select: { storage_path: true },
      });
    }
  }

  return NextResponse.json({ storage_path: row?.storage_path ?? null });
}
