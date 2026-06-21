"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { supabaseImageLoader } from "@/lib/supabaseImageLoader";
import { resolveMediaUrl } from "@/lib/storage/backend";

// Compact horizontal product card used inside the VideoPlayerModal's
// "Featured products" strip. Deliberately strips out the standard
// ProductCard's badges, brand line, details, and Add-to-Cart / Buy-Now
// buttons — the user is in a video-watching context and just wants a
// glanceable thumb + name + price. Whole row is one big clickable Link
// to the PDP, where the full purchase flow lives.

type CompactProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  hero_image_url?: string | null;
  hero_image_path?: string | null;
  // Phase 1 country offers — when set by an upstream resolver, used
  // verbatim. Otherwise fall back to legacy sale_price/price logic.
  effective_price?: number | null;
};

function saleWindowActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

export function CompactProductCard({ product }: { product: CompactProduct }) {
  const { formatPrice } = useCurrency();
  // Derive imageUrl from props every render. Was previously kept in
  // useState, which only initialized on mount — when the parent
  // (VideoPlayerModal in the single-product branch) reused the same
  // component instance and passed a new product, the URL stayed stuck
  // on the *previous* product's image. useMemo recomputes whenever
  // either source field changes; getPublicUrl is sync so no state /
  // effect required.
  const imageUrl = useMemo<string | null>(() => {
    if (product.hero_image_url) return product.hero_image_url;
    if (product.hero_image_path) {
      return resolveMediaUrl("product-media", product.hero_image_path) ?? null;
    }
    return null;
  }, [product.hero_image_url, product.hero_image_path]);

  const saleActive = useMemo(
    () =>
      product.sale_price != null &&
      saleWindowActive(product.sale_starts_at ?? null, product.sale_ends_at ?? null),
    [product.sale_price, product.sale_starts_at, product.sale_ends_at]
  );

  const effectivePrice =
    product.effective_price != null
      ? product.effective_price
      : saleActive && product.sale_price != null
        ? product.sale_price
        : product.price ?? null;
  // Strikethrough comparator: prefer compare_at_price; otherwise the
  // original price when there's an active sale at sale_price.
  const strikePrice =
    saleActive && product.sale_price != null && product.price != null && product.price > product.sale_price
      ? product.price
      : product.compare_at_price && effectivePrice != null && product.compare_at_price > effectivePrice
        ? product.compare_at_price
        : null;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="flex items-center gap-3 rounded-lg border bg-background p-2 hover:bg-muted/50 transition-colors min-w-0"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.name}
            fill
            className="object-cover"
            sizes="64px"
            loader={supabaseImageLoader}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-muted" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm leading-tight line-clamp-2">{product.name}</p>
        <div className="mt-1 flex items-baseline gap-2">
          {effectivePrice != null && (
            <span className="text-sm font-semibold">{formatPrice(effectivePrice)}</span>
          )}
          {strikePrice != null && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(strikePrice)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
