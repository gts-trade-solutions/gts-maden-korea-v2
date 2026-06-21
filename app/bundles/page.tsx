"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { ProductCard } from "@/components/ProductCard";
import { CustomerLayout } from "@/components/CustomerLayout";
import {
  mergeTranslations,
  PRODUCT_TRANSLATABLE_FIELDS,
} from "@/lib/contentTranslations";
import { augmentProductsWithCountryOffers } from "@/lib/pricing";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

function readCountryFromCookie(): string {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

// A bundle is just a product with `is_bundle = true`. Same schema, same
// pricing, same stock. This page is the "Bundles" landing surface — every
// published product flagged as a bundle, newest first.
type Product = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  hero_image_path?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  is_bundle?: boolean | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  stock_qty?: number | null;
  brands?: { name?: string | null } | null;
};

export default function BundlesPage() {
  const t = useTranslations("bundlesPage");
  const locale = useLocale();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data, error } = await supabase
        .from("products")
        .select(`
          id, slug, name,
          price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          hero_image_path, is_featured, is_trending, is_bundle,
          short_description, volume_ml, net_weight_g, country_of_origin, stock_qty,
          brands ( name ),
          product_translations!left ( locale, short_description, description )
        `)
        .eq("is_published", true)
        .eq("is_bundle", true)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Bundles fetch error:", error);
        setProducts([]);
      } else {
        const translated = mergeTranslations(
          (data ?? []) as any[],
          locale,
          PRODUCT_TRANSLATABLE_FIELDS,
          "product_translations"
        ) as Product[];
        const augmented = await augmentProductsWithCountryOffers(
          translated,
          readCountryFromCookie(),
          supabase
        );
        if (!cancelled) setProducts(augmented as Product[]);
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-10">
        <h1 className="mb-2 text-3xl font-bold uppercase">{t("title")}</h1>
        <p className="mb-8 text-sm text-muted-foreground">{t("subtitle")}</p>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[0.8] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={{
                  ...product,
                  hero_image_path: product.hero_image_path ?? undefined,
                  brands: product.brands ?? undefined,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
