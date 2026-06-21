// app/products/[slug]/page.tsx
export const revalidate = 300;

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import ProductPage from './product';
import type { StoryBlock } from '@/lib/types/productStory';
import { DELIVERY_THRESHOLD, DEFAULT_SHIPPING_FEE } from '@/lib/membership';
import { BreadcrumbJsonLd, type BreadcrumbCrumb } from '@/components/BreadcrumbJsonLd';
import { isSupportedCountry, DEFAULT_COUNTRY } from '@/lib/countries';
import { fetchCountryOffers, effectivePriceForCountry } from '@/lib/pricing';
import {
  mergeTranslation,
  PRODUCT_TRANSLATABLE_FIELDS,
} from '@/lib/contentTranslations';
import { getLocale } from 'next-intl/server';
import { resolveMediaUrl } from '@/lib/storage/backend';

const STORY_SELECT_COLUMNS =
  'id, product_id, position, block_type, size, mode, headline, body, text_position, text_color, text_bg, text_size, text_weight, caption_mode, caption_backdrop, split_direction, image_path, image_alt, image_focal_x, image_focal_y, image_fit, image_zoom, image_bg, caption, stats_items, before_image_path, after_image_path, comparison_caption, created_at, updated_at';

const getStoryBlocksForProduct = unstable_cache(
  async (productId: string): Promise<StoryBlock[]> => {
    if (process.env.CATALOG_BACKEND === 'mysql') {
      const { getStoryBlocksMysql } = await import('@/lib/data/catalog');
      return (await getStoryBlocksMysql(productId)) as unknown as StoryBlock[];
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from('product_story_blocks')
      .select(STORY_SELECT_COLUMNS)
      .eq('product_id', productId)
      .order('position', { ascending: true });
    if (error) {
      // If a v3/v4 column hasn't been added yet, retry without it so
      // we don't take the section offline during the migration window.
      const optionalCols = [
        'text_size',
        'text_weight',
        'caption_mode',
        'caption_backdrop',
        'image_focal_x',
        'image_focal_y',
        'image_fit',
        'image_zoom',
        'image_bg',
        'text_bg',
      ];
      const missing = optionalCols.find((c) => error.message.includes(c));
      if (missing) {
        const stripped = optionalCols.reduce(
          (acc, c) => acc.replace(`, ${c}`, ''),
          STORY_SELECT_COLUMNS
        );
        const fallback = await supabase
          .from('product_story_blocks')
          .select(stripped)
          .eq('product_id', productId)
          .order('position', { ascending: true });
        return ((fallback.data ?? []) as unknown) as StoryBlock[];
      }
      return [];
    }
    return ((data ?? []) as unknown) as StoryBlock[];
  },
  ['story-blocks-by-product'],
  { revalidate: 300, tags: ['story-blocks'] }
);

// Build a public URL for images in the "product-media" bucket
function publicFromProductMedia(path?: string | null) {
  if (!path) return null;
  return resolveMediaUrl('product-media', path) ?? null;
}

const SITE =
  (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://madenkorea.com').replace(/\/$/, '');

// Full product row + product_translations join. Cached for 5 minutes,
// invalidated by admin save (see /api/admin/products/revalidate).
// The shape is intentionally a superset of every field the client
// component reads — passing it as `initialProduct` to <ProductPage />
// lets the client skip its own product re-fetch entirely.
const getPublishedProductBySlug = unstable_cache(
  async (slug: string) => {
    if (process.env.CATALOG_BACKEND === 'mysql') {
      const { getProductDetailBySlug } = await import('@/lib/data/catalog');
      return await getProductDetailBySlug(slug);
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data } = await supabase
      .from('products')
      .select(`
      id, slug, name, short_description, description,
      price, currency, sale_price, compare_at_price, sale_starts_at, sale_ends_at,
      is_published, brand_id, category_id, hero_image_path, stock_qty, sku,
      volume_ml, net_weight_g, country_of_origin, new_until,
      is_featured, is_trending, is_bundle,
      made_in_korea, is_vegetarian, cruelty_free, toxin_free, paraben_free,
      ingredients_md, key_features_md, additional_details_md, box_contents_md, key_benefits,
      video_path, vendor_id,
      brands ( name, slug ),
      product_translations!left ( locale, short_description, description, ingredients_md, additional_details_md, key_features_md, box_contents_md, faq, key_benefits, additional_details )
    `)
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();

    return data ?? null;
  },
  ['published-product-by-slug'],
  // Tag with both a global "products" key and a per-slug key so the
  // admin save handler can invalidate just the affected product without
  // wiping every product cache. Cache is locale-agnostic — we store the
  // raw row + the full translations array and merge per-request below.
  { revalidate: 300, tags: ['products'] }
);

// Full product_images rows (storage_path + alt + sort_order). Cached
// separately so admin updates to gallery don't require a full product
// re-fetch. Used in two places:
//   1. JSON-LD image[] array — only needs the paths
//   2. Passed to <ProductPage initialImages={...} /> so the browser
//      gets the gallery image URLs in the server HTML and can start
//      loading them during hydration instead of waiting for a
//      client-side fetch round trip
type ProductImageRow = {
  storage_path: string;
  alt: string | null;
  sort_order: number;
};
const getProductImages = unstable_cache(
  async (productId: string): Promise<ProductImageRow[]> => {
    if (process.env.CATALOG_BACKEND === 'mysql') {
      const { getProductImagesMysql } = await import('@/lib/data/catalog');
      return await getProductImagesMysql(productId);
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from('product_images')
      .select('storage_path, alt, sort_order')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
      .limit(8);
    return ((data ?? []).filter((r) => r.storage_path) as ProductImageRow[]);
  },
  ['product-images-full'],
  { revalidate: 300, tags: ['products'] }
);

// Pre-aggregated rating from the `product_review_stats` view. Returns
// null when the product has no published reviews — JSON-LD only includes
// `aggregateRating` when there is at least one review (Google requires
// reviewCount >= 1).
const getProductReviewStats = unstable_cache(
  async (productId: string): Promise<{ rating_avg: number | null; rating_count: number } | null> => {
    if (process.env.CATALOG_BACKEND === 'mysql') {
      const { getReviewStatsMysql } = await import('@/lib/data/catalog');
      return await getReviewStatsMysql(productId);
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from('product_review_stats')
      .select('rating_avg, rating_count')
      .eq('product_id', productId)
      .maybeSingle();
    return data ?? null;
  },
  ['product-review-stats'],
  { revalidate: 300, tags: ['products', 'reviews'] }
);

// ----------------- Metadata -----------------
export async function generateMetadata(
  { params }: { params: { slug?: string; handle?: string } }
): Promise<Metadata> {
  const slug = params?.slug || params?.handle;
  if (!slug) {
    return {
      title: 'Product not found | MadenKorea',
      description: 'This product is unavailable.',
      robots: { index: false, follow: false },
    };
  }

  const prod = await getPublishedProductBySlug(slug);

  if (!prod) {
    return {
      title: 'Product not found | MadenKorea',
      description: 'This product is unavailable.',
      robots: { index: false, follow: false },
    };
  }

  const canonical = `${SITE}/products/${prod.slug}`;
  const image =
    publicFromProductMedia(prod.hero_image_path) ?? `${SITE}/og/product-default.jpg`;

  const title = `${prod.name} — Buy Online at MadenKorea`;
  const description =
    prod.short_description ??
    (prod.description ? prod.description.slice(0, 160) : 'Shop Korean beauty and lifestyle products.');
  const currency = (prod.currency ?? 'INR').toUpperCase();

  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      'MadenKorea',
      'Korean beauty',
      'K-beauty',
      prod.brands?.name || 'Brand',
      prod.name,
    ],
    openGraph: {
      url: canonical,
      siteName: 'MadenKorea',
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: prod.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    robots: { index: true, follow: true },
  };
}

// ----------------- Page -----------------
export default async function Page({
  params,
}: {
  params: { slug?: string; handle?: string };
}) {
  const slug = params?.slug || params?.handle;
  if (!slug) notFound();

  const rawProd = await getPublishedProductBySlug(slug);
  if (!rawProd) notFound();

  // Merge translated fields (description, ingredients, etc.) for the
  // active locale BEFORE passing to the client component. The cached
  // row stores all translations; the merge is per-request and cheap.
  // Doing this server-side means the client component never has to
  // refetch the product just to apply translations.
  const locale = await getLocale();
  const prod = mergeTranslation(
    rawProd as any,
    locale,
    PRODUCT_TRANSLATABLE_FIELDS,
    'product_translations'
  ) as typeof rawProd;

  // Server-side fetch of Discover blocks so the section is SEO-visible
  // and doesn't trigger a separate client roundtrip after hydration.
  // Run alongside the gallery + review-stats fetches in parallel.
  const [storyBlocks, galleryImages, reviewStats] = await Promise.all([
    prod.id ? getStoryBlocksForProduct(prod.id) : Promise.resolve([] as StoryBlock[]),
    prod.id ? getProductImages(prod.id) : Promise.resolve([] as ProductImageRow[]),
    prod.id ? getProductReviewStats(prod.id) : Promise.resolve(null),
  ]);

  // Combined image list: hero first (Google prefers landscape primary),
  // then gallery in admin sort order, deduped, fallback to default OG.
  const heroUrl = publicFromProductMedia(prod.hero_image_path);
  const galleryUrls = galleryImages
    .map((r) => publicFromProductMedia(r.storage_path))
    .filter((u): u is string => !!u);
  const allImages = Array.from(
    new Set([heroUrl, ...galleryUrls].filter((u): u is string => !!u))
  );
  const image = allImages.length ? allImages : [`${SITE}/og/product-default.jpg`];

  const description =
    prod.short_description ??
    (prod.description ? prod.description.slice(0, 160) : undefined);
  const currency = (prod.currency ?? 'INR').toUpperCase();

  // Phase 1 country offers — resolve the visitor's country-specific
  // offer (if any) and use it as the canonical price for JSON-LD and
  // the price snapshot we pass to <ProductPage />. Falls through to
  // sale_price / price when the country has no offer set.
  const cookieCountry = cookies().get('mik_country')?.value;
  const countryForPricing = isSupportedCountry(cookieCountry)
    ? cookieCountry
    : DEFAULT_COUNTRY;
  let countryOffers: Record<string, number> = {};
  if (prod.id) {
    if (process.env.CATALOG_BACKEND === 'mysql') {
      const { fetchCountryOffersMysql } = await import('@/lib/data/catalog');
      countryOffers = await fetchCountryOffersMysql([prod.id], countryForPricing);
    } else {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      countryOffers = await fetchCountryOffers([prod.id], countryForPricing, supabase);
    }
  }
  const finalPrice = effectivePriceForCountry(
    {
      id: prod.id,
      price: prod.price,
      sale_price: prod.sale_price,
      sale_starts_at: prod.sale_starts_at,
      sale_ends_at: prod.sale_ends_at,
    },
    countryOffers
  );
  const inStock = (prod.stock_qty ?? 0) > 0;

  // priceValidUntil — prefer the active sale_ends_at if it's in the
  // future. Otherwise default to 1 year out, which is what Google
  // recommends when a hard sale window isn't set (omitting the field
  // raises a warning in Rich Results Test).
  const oneYearOut = new Date();
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  const saleEnd = prod.sale_ends_at ? new Date(prod.sale_ends_at) : null;
  const priceValidUntil = (saleEnd && saleEnd > new Date() ? saleEnd : oneYearOut)
    .toISOString()
    .slice(0, 10);

  // Country of origin: prefer explicit column, else infer from the
  // made_in_korea boolean. Empty string omits the field.
  const countryCode = prod.made_in_korea
    ? 'KR'
    : prod.country_of_origin?.toUpperCase().startsWith('KOREA')
    ? 'KR'
    : prod.country_of_origin?.length === 2
    ? prod.country_of_origin.toUpperCase()
    : undefined;

  // Standard "rest of India" delivery window from the storefront copy.
  // Worst-case 15d for islands; tightest 1d in Chennai metro. Reflects
  // the delivery-checker on the product page.
  const deliveryTime = {
    '@type': 'ShippingDeliveryTime',
    handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
    transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 15, unitCode: 'DAY' },
  };
  const shippingDestination = {
    '@type': 'DefinedRegion',
    addressCountry: 'IN',
  };
  // Two-tier shipping declaration: ₹DEFAULT_SHIPPING_FEE under
  // DELIVERY_THRESHOLD, free at or above. K Plus members get free
  // shipping unconditionally — that's a member benefit, not a public
  // shipping rate, so it isn't reflected here.
  const shippingDetails = [
    {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: DEFAULT_SHIPPING_FEE, currency: 'INR' },
      eligibleTransactionVolume: {
        '@type': 'PriceSpecification',
        minPrice: 0,
        maxPrice: DELIVERY_THRESHOLD - 0.01,
        priceCurrency: 'INR',
      },
      shippingDestination,
      deliveryTime,
    },
    {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'INR' },
      eligibleTransactionVolume: {
        '@type': 'PriceSpecification',
        minPrice: DELIVERY_THRESHOLD,
        priceCurrency: 'INR',
      },
      shippingDestination,
      deliveryTime,
    },
  ];

  // 7-day return window for damaged / defective / wrong items, free
  // pickup. Mirrors /policies/replacements.
  const merchantReturnPolicy = {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'IN',
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: 7,
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: 'https://schema.org/FreeReturn',
  };

  const aggregateRating =
    reviewStats && reviewStats.rating_count > 0 && reviewStats.rating_avg != null
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(reviewStats.rating_avg).toFixed(1),
          reviewCount: reviewStats.rating_count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined;

  // Surface volume / net weight as additionalProperty so they appear in
  // rich results without faking schema fields they don't fit (`weight`
  // is for the product itself, not packaged net weight).
  const additionalProperty = [
    prod.volume_ml ? { '@type': 'PropertyValue', name: 'Volume', value: `${prod.volume_ml} ml` } : null,
    prod.net_weight_g ? { '@type': 'PropertyValue', name: 'Net weight', value: `${prod.net_weight_g} g` } : null,
  ].filter(Boolean);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: prod.name,
    description,
    image,
    sku: prod.sku || prod.id,
    productID: prod.id,
    brand: prod.brands?.name ? { '@type': 'Brand', name: prod.brands.name } : undefined,
    countryOfOrigin: countryCode ? { '@type': 'Country', name: countryCode } : undefined,
    additionalProperty: additionalProperty.length ? additionalProperty : undefined,
    aggregateRating,
    offers: {
      '@type': 'Offer',
      url: `${SITE}/products/${prod.slug}`,
      priceCurrency: currency,
      price: finalPrice,
      priceValidUntil,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'MadenKorea' },
      shippingDetails,
      hasMerchantReturnPolicy: merchantReturnPolicy,
    },
  };

  // Breadcrumb trail. We use the brand as the mid-level when present
  // (matches the customer-visible navigation) — categories aren't shown
  // in the PDP header today, so leading with brand is more consistent.
  const crumbs: BreadcrumbCrumb[] = [
    { name: 'Home', url: '/' },
    ...(prod.brands?.name && prod.brands?.slug
      ? [{ name: prod.brands.name as string, url: `/brand/${prod.brands.slug}` }]
      : []),
    { name: prod.name, url: `/products/${prod.slug}` },
  ];

  return (
    <>
      <ProductPage
        initialProduct={prod as any}
        initialImages={galleryImages}
        initialStoryBlocks={storyBlocks}
      />
      <script
        type="application/ld+json"
        // undefined fields are omitted by JSON.stringify
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <BreadcrumbJsonLd items={crumbs} />
    </>
  );
}
