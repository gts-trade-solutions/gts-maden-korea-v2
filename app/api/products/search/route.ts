import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") || 20), 50);

  try {
    // Return only published products; name/slug substring match when a query
    // is present, otherwise the first `limit` published products by name.
    const products = await prisma.products.findMany({
      where: {
        is_published: true,
        ...(q
          ? { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }
          : {}),
      },
      select: { id: true, name: true, slug: true, price: true, currency: true, is_published: true },
      orderBy: { name: "asc" },
      take: limit,
    });
    return NextResponse.json({ ok: true, products: jsonSafe(products) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "search_failed" }, { status: 400 });
  }
}
