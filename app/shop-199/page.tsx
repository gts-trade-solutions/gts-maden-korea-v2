import { cookies } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import {
  getShop199ProductsMysql,
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

// Shop@199: published products on sale at ≤ ₹199 within their live sale window,
// cheapest first. Sale-window filter is enforced in the MySQL query. SSR, no
// Supabase.
export default async function Shop199Page() {
  const t = await getTranslations("shop199Page");
  const locale = await getLocale();

  const rawCountry = cookies().get("mik_country")?.value ?? "";
  const country = isSupportedCountry(rawCountry) ? rawCountry : DEFAULT_COUNTRY;

  const rows = await getShop199ProductsMysql(new Date());
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
