export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { SUPPORTED_COUNTRIES, isSupportedCountry } from "@/lib/countries";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only CRUD for per-country offer prices on a single product.
//
// Backs the "Country offers" panel on /admin/products/[id]. The table this
// writes (`product_country_prices`) is read by `effectivePriceForCountry()`
// everywhere in the storefront. Reads + writes go directly to MySQL (Prisma).
//
// PUT semantics are REPLACE-ALL: the client sends the full set of offers it
// wants the product to have. Anything not in the payload is deleted.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IncomingOffer = {
  country_code: string;
  offer_price: number;
  is_active?: boolean;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const productId = params.id;
  if (!UUID_RE.test(productId)) {
    return json({ ok: false, error: "BAD_PRODUCT_ID" }, 400);
  }

  const [product, offers] = await Promise.all([
    prisma.products.findUnique({
      where: { id: productId },
      select: {
        id: true, name: true, price: true, sale_price: true,
        compare_at_price: true, currency: true,
      },
    }),
    prisma.product_country_prices.findMany({
      where: { product_id: productId },
      select: { country_code: true, offer_price: true, is_active: true, updated_at: true },
      orderBy: { country_code: "asc" },
    }),
  ]);

  if (!product) return json({ ok: false, error: "PRODUCT_NOT_FOUND" }, 404);

  return json({
    ok: true,
    product: jsonSafe({
      id: product.id,
      name: product.name,
      compare_at_price: product.compare_at_price,
      price: product.price,
      sale_price: product.sale_price,
      currency: product.currency ?? "INR",
    }),
    offers: jsonSafe(offers),
    supported_countries: SUPPORTED_COUNTRIES,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const productId = params.id;
  if (!UUID_RE.test(productId)) {
    return json({ ok: false, error: "BAD_PRODUCT_ID" }, 400);
  }

  const body = await req.json().catch(() => ({}));
  const incoming: IncomingOffer[] = Array.isArray(body?.offers) ? body.offers : [];

  // Per-row validation. Collect the full list of issues before failing so the
  // admin sees every bad row in one toast, not one at a time.
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const row of incoming) {
    const cc = String(row.country_code ?? "").toUpperCase();
    const price = Number(row.offer_price);
    if (!isSupportedCountry(cc)) {
      issues.push(`Unsupported country: ${row.country_code}`);
      continue;
    }
    if (seen.has(cc)) {
      issues.push(`Duplicate row for ${cc}`);
      continue;
    }
    seen.add(cc);
    if (!Number.isFinite(price) || price <= 0) {
      issues.push(`${cc}: offer price must be > 0`);
    }
  }
  if (issues.length > 0) {
    return json({ ok: false, error: "VALIDATION_FAILED", issues }, 400);
  }

  // Need MRP for the < MRP check. If null we skip the upper-bound validation.
  const product = await prisma.products.findUnique({
    where: { id: productId },
    select: { id: true, compare_at_price: true },
  });
  if (!product) return json({ ok: false, error: "PRODUCT_NOT_FOUND" }, 404);

  const mrp = product.compare_at_price == null ? null : Number(product.compare_at_price);
  if (mrp != null) {
    const overMrp: string[] = [];
    for (const row of incoming) {
      const cc = String(row.country_code).toUpperCase();
      const price = Number(row.offer_price);
      if (price >= mrp) overMrp.push(`${cc}: offer ${price} must be < MRP ${mrp}`);
    }
    if (overMrp.length > 0) {
      return json({ ok: false, error: "OFFER_EXCEEDS_MRP", issues: overMrp }, 400);
    }
  }

  // REPLACE-ALL, transactional: drop every existing offer for this product and
  // insert the incoming set. When `incoming` is empty this clears all offers,
  // which is the desired "remove all offers" behavior.
  const rows = incoming.map((r) => ({
    id: randomUUID(),
    product_id: productId,
    country_code: String(r.country_code).toUpperCase(),
    offer_price: Number(r.offer_price),
    is_active: r.is_active === false ? false : true,
  }));

  await prisma.$transaction([
    prisma.product_country_prices.deleteMany({ where: { product_id: productId } }),
    ...(rows.length
      ? [prisma.product_country_prices.createMany({ data: rows })]
      : []),
  ]);

  // Return the fresh state so the form can reconcile without a second GET.
  const fresh = await prisma.product_country_prices.findMany({
    where: { product_id: productId },
    select: { id: true, country_code: true, offer_price: true, is_active: true, updated_at: true },
    orderBy: { country_code: "asc" },
  });

  return json({ ok: true, offers: jsonSafe(fresh) });
}
