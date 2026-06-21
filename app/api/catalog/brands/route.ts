import { NextResponse } from "next/server";
import { getActiveBrands } from "@/lib/data/catalog";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/catalog/brands — active brands from MySQL, ordered by position.
export async function GET() {
  const rows = await getActiveBrands();
  return NextResponse.json({ brands: jsonSafe(rows) });
}
