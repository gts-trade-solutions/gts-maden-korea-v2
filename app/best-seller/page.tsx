import { cookies } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import {
  getBestSellerProductsMysql,
  applyCountryOffers,
} from "@/lib/data/catalog";
import { ProductCard } from "@/components/ProductCard";
import { CustomerLayout } from "@/components/CustomerLayout";
import {
  mergeTranslations,
  PRODUCT_TRANSLATABLE_FIELDS,
} from "@/lib/contentTranslations";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

export const dynamic = "force-dynamic";

// SSR "Best Sellers" rail. Reads trending (with a featured fallback to reach 8)
// straight from MySQL, merges the visitor-locale translations, then applies the
// per-country offer price. No client-side data fetch, no Supabase.
export default async function BestSellerPage() {
  const t = await getTranslations("bestSeller");
  const locale = await getLocale();

  const rawCountry = cookies().get("mik_country")?.value ?? "";
  const country = isSupportedCountry(rawCountry) ? rawCountry : DEFAULT_COUNTRY;

  const { products: rows, usedFallback } = await getBestSellerProductsMysql(8);
  const translated = mergeTranslations(
    rows as any[],
    locale,
    PRODUCT_TRANSLATABLE_FIELDS,
    "product_translations",
  ) as any[];
  const products = await applyCountryOffers(translated, country);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-10">
        <h1 className="mb-2 text-3xl font-bold uppercase">{t("title")}</h1>
        <p className="mb-8 text-sm text-muted-foreground">{t("subtitle")}</p>
        {usedFallback && (
          <p className="mb-6 text-sm text-muted-foreground">{t("fallbackNotice")}</p>
        )}

        {products.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product: any) => (
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
