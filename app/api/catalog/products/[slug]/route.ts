import { NextResponse } from "next/server";
import { getProductBySlug } from "@/lib/data/catalog";
import { jsonSafe } from "@/lib/db/serialize";

export const dynamic = "force-dynamic";

// GET /api/catalog/products/[slug] — single product + brand + images from MySQL.
export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const product = await getProductBySlug(params.slug);
  if (!product || !product.is_published || product.deleted_at) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ product: jsonSafe(product) });
}
