// GET /feed/products.xml
//
// Google Merchant Center + Meta Commerce Manager product feed (RSS 2.0
// with the `g:` namespace). Both platforms accept this exact format, so
// the single URL serves both — you point each platform's "scheduled
// fetch" at this URL and you're done.
//
// Today's scope: India only. The query string supports
// `?country=<ISO2>` for forward-compat — when we add per-country
// pricing-with-FX, additional markets get their own subscriptions in
// the merchant tools.
//
// Caching: 1 hour at the edge. Google + Meta poll feeds every 6-24
// hours; cache hits keep this route cheap on Vercel/Netlify. Pass
// `?nocache=1` if you need to force a fresh build right after editing
// catalog data.
//
// Setup:
//   - Google Merchant Center → Products → Feeds → Create feed →
//     Scheduled fetch → URL: https://madenkorea.com/feed/products.xml
//   - Meta Commerce Manager → Catalog → Data sources → Use a URL →
//     paste the same URL.
//
// Field reference:
//   - https://support.google.com/merchants/answer/7052112 (Google spec)
//   - https://developers.facebook.com/docs/marketing-api/catalog/reference
//     (Meta accepts the same `g:` namespace tags Google uses)

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { resolveMediaUrl } from "@/lib/storage/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Site root used for canonical product links. Keep aligned with the
// metadata `metadataBase` in app/layout.tsx.
const SITE_URL = "https://madenkorea.com";

// Public-bucket URL pattern: <SUPABASE_URL>/storage/v1/object/public/<bucket>/<path>
const PRODUCT_MEDIA_BUCKET = "product-media";

// Static Google taxonomy entry for K-beauty/cosmetics. Google accepts
// either the integer ID or the full taxonomy string; the string is
// more human-readable when debugging.
//   Health & Beauty → Personal Care → Cosmetics (469)
const GOOGLE_PRODUCT_CATEGORY = "Health & Beauty > Personal Care > Cosmetics";

// Maximum lengths from the GMC spec — exceeded values get clipped.
const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;
const MAX_ADDITIONAL_IMAGES = 10;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trim() + "…";
}

function buildImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return resolveMediaUrl(PRODUCT_MEDIA_BUCKET, path) ?? null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const country = (url.searchParams.get("country") || "IN").toUpperCase();
  const noCache = url.searchParams.get("nocache") === "1";

  // Only India is supported at launch. Other countries' offer prices
  // are stored in INR; emitting them in a feed flagged with their own
  // currency would mislabel the price. Returning 404 keeps Google /
  // Meta from accidentally indexing a half-correct feed.
  if (country !== "IN") {
    return new NextResponse("Country not yet supported for catalog feed", {
      status: 404,
    });
  }

  const sb = createServiceClient();

  // 1) Products — published, not bundle, not soft-deleted.
  const { data: products, error: pErr } = await sb
    .from("products")
    .select(
      "id, sku, slug, name, short_description, description, brand, brand_id, price, sale_price, sale_starts_at, sale_ends_at, compare_at_price, hero_image_path, stock_qty, track_inventory, gross_weight_g, category_id, is_bundle"
    )
    .eq("is_published", true)
    .eq("is_bundle", false)
    .is("deleted_at", null);

  if (pErr) {
    console.error("[feed/products.xml] products fetch failed:", pErr);
    return new NextResponse("Feed temporarily unavailable", { status: 500 });
  }

  const productList = products ?? [];

  // 2) Brands map (FK preferred, products.brand text as fallback).
  const brandIds = Array.from(
    new Set(productList.map((p) => p.brand_id).filter(Boolean) as string[])
  );
  let brandMap = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands } = await sb
      .from("brands")
      .select("id, name")
      .in("id", brandIds);
    for (const b of brands ?? []) {
      brandMap.set(b.id as string, (b.name as string) ?? "");
    }
  }

  // 3) Category names for g:product_type.
  const categoryIds = Array.from(
    new Set(productList.map((p) => p.category_id).filter(Boolean) as string[])
  );
  let categoryMap = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: cats } = await sb
      .from("categories")
      .select("id, name")
      .in("id", categoryIds);
    for (const c of cats ?? []) {
      categoryMap.set(c.id as string, (c.name as string) ?? "");
    }
  }

  const productIds = productList.map((p) => p.id as string);

  // 4) Country offer prices for India.
  let offerMap = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: offers } = await sb
      .from("product_country_prices")
      .select("product_id, offer_price")
      .in("product_id", productIds)
      .eq("country_code", country)
      .eq("is_active", true);
    for (const o of offers ?? []) {
      const v = Number(o.offer_price);
      if (Number.isFinite(v) && v > 0)
        offerMap.set(o.product_id as string, v);
    }
  }

  // 5) Additional images (up to MAX_ADDITIONAL_IMAGES per product).
  let imgMap = new Map<string, string[]>();
  if (productIds.length > 0) {
    const { data: imgs } = await sb
      .from("product_images")
      .select("product_id, storage_path, sort_order")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });
    for (const img of imgs ?? []) {
      const arr = imgMap.get(img.product_id as string) ?? [];
      if (arr.length < MAX_ADDITIONAL_IMAGES) {
        arr.push(img.storage_path as string);
        imgMap.set(img.product_id as string, arr);
      }
    }
  }

  const now = Date.now();
  const items: string[] = [];

  for (const p of productList) {
    const heroUrl = buildImageUrl(p.hero_image_path as string | null);
    if (!heroUrl) continue; // Google requires a primary image.

    // Pricing — country offer wins, then legacy sale_price within
    // window, else `price`. `compare_at_price` (MRP) becomes the base
    // when a sale/offer is active, so Google shows the strike-through.
    const offer = offerMap.get(p.id as string);
    const saleWindowActive =
      p.sale_price != null &&
      (!p.sale_starts_at || new Date(p.sale_starts_at as string).getTime() <= now) &&
      (!p.sale_ends_at || new Date(p.sale_ends_at as string).getTime() >= now);

    let basePrice = Number(p.price ?? 0);
    let salePrice: number | null = null;

    if (offer != null) {
      basePrice = Number(p.compare_at_price ?? p.price ?? offer);
      salePrice = offer < basePrice ? offer : null;
      if (basePrice <= 0) basePrice = offer;
    } else if (saleWindowActive) {
      basePrice = Number(p.compare_at_price ?? p.price ?? p.sale_price);
      salePrice = Number(p.sale_price);
      if (basePrice <= 0) basePrice = salePrice ?? 0;
    }

    if (basePrice <= 0) continue; // skip un-priced rows

    // Availability — `track_inventory=false` means "always in stock"
    // (digital / pre-ordered / large constant stock without exact
    // counts). When tracked, `stock_qty <= 0` is out of stock.
    const tracksInventory = p.track_inventory === true;
    const inStock = !tracksInventory || Number(p.stock_qty ?? 0) > 0;
    const availability = inStock ? "in_stock" : "out_of_stock";

    const brandName =
      (p.brand_id && brandMap.get(p.brand_id as string)) ||
      (p.brand as string | null) ||
      "MadenKorea";
    const category = p.category_id
      ? categoryMap.get(p.category_id as string)
      : null;

    const additionalImageUrls = (imgMap.get(p.id as string) ?? [])
      .map((path) => buildImageUrl(path))
      .filter((u): u is string => !!u && u !== heroUrl);

    const title = clamp((p.name as string | null) ?? "", MAX_TITLE);
    const descriptionRaw =
      (p.description as string | null) ||
      (p.short_description as string | null) ||
      (p.name as string | null) ||
      "";
    const description = clamp(stripHtml(descriptionRaw), MAX_DESCRIPTION);
    const link = `${SITE_URL}/products/${encodeURIComponent(p.slug as string)}`;

    const parts: string[] = [];
    parts.push(`<g:id>${escapeXml((p.sku as string) || (p.id as string))}</g:id>`);
    parts.push(`<g:title>${escapeXml(title)}</g:title>`);
    parts.push(`<g:description>${escapeXml(description)}</g:description>`);
    parts.push(`<g:link>${escapeXml(link)}</g:link>`);
    parts.push(`<g:image_link>${escapeXml(heroUrl)}</g:image_link>`);
    for (const u of additionalImageUrls) {
      parts.push(`<g:additional_image_link>${escapeXml(u)}</g:additional_image_link>`);
    }
    parts.push(`<g:availability>${availability}</g:availability>`);
    parts.push(`<g:condition>new</g:condition>`);
    parts.push(`<g:price>${basePrice.toFixed(2)} INR</g:price>`);
    if (salePrice != null && salePrice > 0) {
      parts.push(`<g:sale_price>${salePrice.toFixed(2)} INR</g:sale_price>`);
    }
    parts.push(`<g:brand>${escapeXml(brandName)}</g:brand>`);
    // No GTIN/MPN yet — declare the product as not having one so Google
    // doesn't keep prompting for it.
    parts.push(`<g:identifier_exists>false</g:identifier_exists>`);
    parts.push(
      `<g:google_product_category>${escapeXml(GOOGLE_PRODUCT_CATEGORY)}</g:google_product_category>`
    );
    if (category) {
      parts.push(`<g:product_type>${escapeXml(category)}</g:product_type>`);
    }
    const grossWeight = Number(p.gross_weight_g ?? 0);
    if (grossWeight > 0) {
      parts.push(`<g:shipping_weight>${grossWeight} g</g:shipping_weight>`);
    }

    items.push(`    <item>\n      ${parts.join("\n      ")}\n    </item>`);
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml("MadenKorea Products")}</title>\n` +
    `    <link>${SITE_URL}</link>\n` +
    `    <description>${escapeXml("Product feed for MadenKorea — authentic Korean beauty and lifestyle products")}</description>\n` +
    items.join("\n") +
    `\n  </channel>\n` +
    `</rss>\n`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": noCache
        ? "no-store"
        : "public, max-age=3600, s-maxage=3600",
      "X-Feed-Item-Count": String(items.length),
      "X-Feed-Country": country,
    },
  });
}
