import { NextResponse } from "next/server";
import { getPublishedProducts } from "@/lib/data/catalog";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/catalog/products?limit=24&featured=1&trending=1
// Reads published products from local MySQL (Prisma). Read-only, public data.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 24) || 24, 100);
  const featured = searchParams.get("featured") === "1";
  const trending = searchParams.get("trending") === "1";

  const rows = await getPublishedProducts({ limit, featured, trending });
  return NextResponse.json({ products: jsonSafe(rows) });
}
