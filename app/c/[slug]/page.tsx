// app/c/[slug]/page.tsx
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getTranslations, getLocale } from "next-intl/server";
import { CustomerLayout } from "@/components/CustomerLayout";
import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";
import { augmentProductsWithCountryOffers } from "@/lib/pricing";
import { resolveMediaUrl } from "@/lib/storage/backend";
import {
  mergeTranslation,
  mergeTranslations,
  CATEGORY_TRANSLATABLE_FIELDS,
  PRODUCT_TRANSLATABLE_FIELDS,
} from "@/lib/contentTranslations";

export const revalidate = 300; // ISR: refresh every 5 minutes

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  // Optional if you add later:
  // hero_banner_url?: string | null;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  hero_image_path?: string | null;
  created_at?: string | null;
  stock_qty?: number | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  is_bundle?: boolean | null;
  brands?: { name?: string | null; slug?: string | null } | null;
};

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  return resolveMediaUrl("product-media", path) ?? null;
}

export async function generateStaticParams() {
  if (process.env.CATALOG_BACKEND === "mysql") {
    const { prisma } = await import("@/lib/db/prisma");
    const data = await prisma.categories.findMany({
      select: { slug: true },
      orderBy: { slug: "asc" },
      take: 50,
    });
    return data.map((c) => ({ slug: c.slug }));
  }
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("categories")
    .select("slug")
    .order("slug")
    .limit(50);
  return (data ?? []).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  let category: CategoryRow | null = null;
  if (process.env.CATALOG_BACKEND === "mysql") {
    const { prisma } = await import("@/lib/db/prisma");
    category = (await prisma.categories.findUnique({
      where: { slug: params.slug },
      select: { name: true, description: true },
    })) as any;
  } else {
    const supabase = supabaseServer();
    const { data } = await supabase
      .from("categories")
      .select("name, description")
      .eq("slug", params.slug)
      .maybeSingle<CategoryRow>();
    category = data;
  }

  if (!category) {
    // Root layout's title.template appends " | MadenKorea", so the
    // page-level title must NOT include the brand suffix itself.
    return { title: "Category Not Found" };
  }

  return {
    title: category.name,
    description: category.description ?? undefined,
    alternates: { canonical: `/c/${params.slug}` },
    openGraph: {
      // openGraph titles are not run through the title.template, so
      // keep the explicit brand suffix here.
      title: `${category.name} | MadenKorea`,
      description: category.description ?? undefined,
      url: `/c/${params.slug}`,
      type: "website",
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: {
    sort?: string;
    price?: string;
    in_stock?: string;
    brand?: string;
  };
}) {
  const t = await getTranslations("categoryPage");
  const locale = await getLocale();
  const useMysql = process.env.CATALOG_BACKEND === "mysql";

  // 1) Category lookup — joining translations for the active locale.
  let categoryRow: any = null;
  if (useMysql) {
    const { getCategoryWithTranslationsBySlug } = await import("@/lib/data/catalog");
    categoryRow = await getCategoryWithTranslationsBySlug(params.slug);
  } else {
    const supabase = supabaseServer();
    const { data } = await supabase
      .from("categories")
      .select(`*, category_translations!left ( locale, name, description )`)
      .eq("slug", params.slug)
      .maybeSingle();
    categoryRow = data;
  }

  if (!categoryRow) {
    notFound();
  }

  const category = mergeTranslation(
    categoryRow as any,
    locale,
    CATEGORY_TRANSLATABLE_FIELDS,
    "category_translations"
  ) as CategoryRow;

  // 2) Products in this category (published only) + their translations
  let products: any[] = [];
  if (useMysql) {
    const { getCategoryProductsMysql } = await import("@/lib/data/catalog");
    products = await getCategoryProductsMysql(category.id);
  } else {
    const supabase = supabaseServer();
    const { data } = await supabase
      .from("products")
      .select(
        `
        id, slug, name,
        price, currency,
        compare_at_price, sale_price, sale_starts_at, sale_ends_at,
        short_description, volume_ml, net_weight_g, country_of_origin,
        hero_image_path, created_at, stock_qty, is_featured, is_trending, is_bundle,
        brands ( name, slug ),
        product_translations!left ( locale, short_description, description )
      `
      )
      .eq("category_id", category.id)
      .eq("is_published", true);
    products = data ?? [];
  }

  // 3) Merge translations + compute public URLs on the server (faster cards)
  const translated = mergeTranslations(
    products ?? [],
    locale,
    PRODUCT_TRANSLATABLE_FIELDS,
    "product_translations"
  );
  const withImages = translated.map((p) => ({
    ...p,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  })) as ProductRow[];

  // Phase 1: resolve country-specific offer prices once for the
  // whole listing. Each item gets an `effective_price` reflecting
  // either the country offer (if set) or the legacy sale_price /
  // price (fallthrough). Subsequent price-based filtering + sorting
  // uses the country-aware figure so a Polish visitor's "₹5,000 -
  // ₹10,000" filter buckets products by their Polish prices, not the
  // Indian sale price.
  const cookieCountry = cookies().get("mik_country")?.value;
  const country = isSupportedCountry(cookieCountry)
    ? cookieCountry
    : DEFAULT_COUNTRY;
  let items;
  if (useMysql) {
    const { applyCountryOffers } = await import("@/lib/data/catalog");
    items = await applyCountryOffers(withImages, country);
  } else {
    const supabase = supabaseServer();
    items = await augmentProductsWithCountryOffers(withImages, country, supabase);
  }

  const selectedSort = searchParams?.sort || "newest";
  const selectedPrice = searchParams?.price || "all";
  const inStockOnly = searchParams?.in_stock === "1";
  const selectedBrand = searchParams?.brand || "all";

  const brandOptions = Array.from(
    new Map(
      items
        .filter((p) => p.brands?.name)
        .map((p) => [p.brands?.slug || p.brands?.name || "", p.brands])
    ).values()
  );

  const filteredItems = items.filter((p) => {
    const effectivePrice =
      (p as any).effective_price ?? p.sale_price ?? p.price ?? 0;
    const passPrice =
      selectedPrice === "all"
        ? true
        : selectedPrice === "0-5000"
        ? effectivePrice >= 0 && effectivePrice <= 5000
        : selectedPrice === "5000-10000"
        ? effectivePrice > 5000 && effectivePrice <= 10000
        : selectedPrice === "10000+"
        ? effectivePrice > 10000
        : true;
    const passStock = inStockOnly ? (p.stock_qty ?? 0) > 0 : true;
    const brandKey = p.brands?.slug || p.brands?.name || "";
    const passBrand = selectedBrand === "all" ? true : brandKey === selectedBrand;
    return passPrice && passStock && passBrand;
  });

  const sortedItems = filteredItems.slice().sort((a, b) => {
    const aPrice = (a as any).effective_price ?? a.sale_price ?? a.price ?? 0;
    const bPrice = (b as any).effective_price ?? b.sale_price ?? b.price ?? 0;
    if (selectedSort === "price_asc") return aPrice - bPrice;
    if (selectedSort === "price_desc") return bPrice - aPrice;
    if (selectedSort === "popular") {
      const scoreA = (a.is_trending ? 2 : 0) + (a.is_featured ? 1 : 0);
      const scoreB = (b.is_trending ? 2 : 0) + (b.is_featured ? 1 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
    }
    return (
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime()
    );
  });

  return (
    <CustomerLayout>
      <BreadcrumbJsonLd
        items={[
          { name: t("breadcrumbHome"), url: "/" },
          { name: category.name, url: `/c/${category.slug}` },
        ]}
      />
      {/* Optional banner if you later add categories.hero_banner_url */}
      {/* {category.hero_banner_url && (
        <div className="relative w-full aspect-[21/7] bg-muted mb-8">
          <img src={category.hero_banner_url} alt={category.name} className="w-full h-full object-cover" />
        </div>
      )} */}

      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{category.name}</h1>
          {category.description && (
            <p className="text-lg text-muted-foreground">
              {category.description}
            </p>
          )}
        </div>

        <ProductFilters
          itemCount={sortedItems.length}
          selectedSort={selectedSort}
          selectedPrice={selectedPrice}
          selectedBrand={selectedBrand}
          brandOptions={brandOptions}
          inStockOnly={inStockOnly}
        />

        {sortedItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
  {sortedItems.map((product) => (
    <ProductCard key={product.id} product={product as any} />
  ))}
</div>

        )}
      </div>
    </CustomerLayout>
  );
}

