import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getTranslations, getLocale } from 'next-intl/server';
import { CustomerLayout } from '@/components/CustomerLayout';
import { ProductCard } from '@/components/ProductCard';
import { isSupportedCountry, DEFAULT_COUNTRY } from '@/lib/countries';
import { resolveMediaUrl } from '@/lib/storage/backend';
import {
  mergeTranslations,
  PRODUCT_TRANSLATABLE_FIELDS,
} from '@/lib/contentTranslations';

// Search-results pages don't add unique value to Google's index — but
// internal links on them (to actual product pages) are useful, so we
// keep follow:true.
export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: true, nocache: true },
};

type CardProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  is_bundle?: boolean | null;
  new_until?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  stock_qty?: number | null;
  hero_image_path?: string | null;
  hero_image_url?: string | null;
  brands?: { name?: string | null } | null;
};

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  return resolveMediaUrl('product-media', path) ?? null;
}

async function searchProducts(query: string, locale: string): Promise<CardProduct[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Match-ordered product rows (each with a product_translations array).
  const { searchProductsMysql } = await import('@/lib/data/catalog');
  const rows: any[] = await searchProductsMysql(trimmed, 40);

  // Apply translations for the active locale, then card-shape mapping.
  const translated = mergeTranslations(
    rows,
    locale,
    PRODUCT_TRANSLATABLE_FIELDS,
    'product_translations'
  );
  return translated.map((p: any) => ({
    ...p,
    brands: Array.isArray(p.brands) ? p.brands[0] ?? null : p.brands ?? null,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  }));
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? '';
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    redirect('/');
  }

  const locale = await getLocale();
  const rawResults = await searchProducts(trimmedQuery, locale);

  // Phase 1 country offers — attach effective_price for the visitor's
  // country so search results display country-specific prices.
  const cookieCountry = cookies().get('mik_country')?.value;
  const country = isSupportedCountry(cookieCountry)
    ? cookieCountry
    : DEFAULT_COUNTRY;
  const { applyCountryOffers } = await import('@/lib/data/catalog');
  const searchResults = await applyCountryOffers(rawResults, country);
  const hasNoResults = searchResults.length === 0;
  const t = await getTranslations('searchPage');

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
          <p className="text-muted-foreground">
            {t('resultsFor', { q: trimmedQuery })}
          </p>
        </div>

        {hasNoResults ? (
          <div className="text-center py-16">
            <h2 className="text-2xl font-semibold mb-2">{t('noResults', { q: trimmedQuery })}</h2>
            <p className="text-muted-foreground">{t('tryAgain')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {searchResults.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
