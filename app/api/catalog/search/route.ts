import { NextResponse } from "next/server";
import { searchProductsMysql } from "@/lib/data/catalog";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/catalog/search?q=<query>&limit=8
// Typeahead / autocomplete over published products (MySQL via Prisma).
// Replaces the old Postgres `search_products_tsv` RPC that the header
// SearchAutocomplete called directly from the browser. Read-only, public data.
// Each row includes hero_image_path so the client can render a thumbnail.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 8) || 8, 20);

  if (q.length < 2) {
    return NextResponse.json({ ok: true, products: [] });
  }

  try {
    const rows = await searchProductsMysql(q, limit);
    return NextResponse.json({ ok: true, products: jsonSafe(rows) });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "search_failed" },
      { status: 400 }
    );
  }
}
