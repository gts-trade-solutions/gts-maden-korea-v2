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

export default function Shop199Page() {
  const t = useTranslations("shop199Page");
  const locale = useLocale();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const nowIso = new Date().toISOString();

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
        .lte("sale_price", 199)
        .not("sale_price", "is", null)
        .or(`sale_starts_at.is.null,sale_starts_at.lte.${nowIso}`)
        .or(`sale_ends_at.is.null,sale_ends_at.gte.${nowIso}`)
        .order("sale_price", { ascending: true });

      if (!cancelled) {
        if (error) {
          console.error("Shop@199 fetch error:", error);
          setProducts([]);
        } else {
          // The sale-window filter is already enforced server-side by the
          // two .or() clauses on sale_starts_at / sale_ends_at, so we don't
          // need to re-check it here. (Earlier code referenced an undefined
          // `isSaleActive` helper which threw and left the page stuck on the
          // loading skeleton whenever there were matching products.)
          const translated = mergeTranslations(
            (data ?? []) as any[],
            locale,
            PRODUCT_TRANSLATABLE_FIELDS,
            "product_translations"
          ) as Product[];
          // Phase 1 country offers — augment so the displayed price
          // reflects the visitor's country offer when set. Membership
          // of this list is still gated by the server-side sale_price
          // filter (≤ 199); country offers below 199 with no
          // sale_price won't appear here yet.
          const augmented = await augmentProductsWithCountryOffers(
            translated,
            readCountryFromCookie(),
            supabase
          );
          if (!cancelled) setProducts(augmented as Product[]);
        }
        setLoading(false);
      }
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[0.8] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
