import { cookies } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import {
  getBundleProductsMysql,
  applyCountryOffers,
} from "@/lib/data/catalog";
import { ProductCard } from "@/components/ProductCard";
import { CustomerLayout } from "@/components/CustomerLayout";
import {
  mergeTranslations,
  PRODUCT_TRANSLATABLE_FIELDS,
} from "@/lib/contentTranslations";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";
import { resolveMediaUrl } from "@/lib/storage/backend";

export const dynamic = "force-dynamic";

// A bundle is just a product with `is_bundle = true`. SSR list of every
// published bundle, newest first — read straight from MySQL.
export default async function BundlesPage() {
  const t = await getTranslations("bundlesPage");
  const locale = await getLocale();

  const rawCountry = cookies().get("mik_country")?.value ?? "";
  const country = isSupportedCountry(rawCountry) ? rawCountry : DEFAULT_COUNTRY;

  const rows = await getBundleProductsMysql();
  const translated = mergeTranslations(
    rows as any[],
    locale,
    PRODUCT_TRANSLATABLE_FIELDS,
    "product_translations",
  ) as any[];
  const withImages = translated.map((p) => ({
    ...p,
    hero_image_url: resolveMediaUrl("product-media", p.hero_image_path) ?? undefined,
  }));
  const products = await applyCountryOffers(withImages, country);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-10">
        <h1 className="mb-2 text-3xl font-bold uppercase">{t("title")}</h1>
        <p className="mb-8 text-sm text-muted-foreground">{t("subtitle")}</p>

        {products.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
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
