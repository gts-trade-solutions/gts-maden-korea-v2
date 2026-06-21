// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';
import { resolveMediaUrl } from '@/lib/storage/backend';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://madenkorea.com').replace(/\/$/, '');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

// Rebuild at most once per hour
export const revalidate = 60 * 60;

// Resolve a `product_images.storage_path` (or `products.hero_image_path`)
// to a public URL on the Supabase product-media bucket. Cheaper than
// instantiating a client just to call getPublicUrl().
function publicProductMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return resolveMediaUrl('product-media', path) ?? null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [{ data: products }, { data: categories }, { data: brands }] = await Promise.all([
    supabase
      .from('products')
      .select('slug, hero_image_path, updated_at, created_at, is_published')
      .eq('is_published', true),
    supabase
      .from('categories')
      .select('slug, updated_at, created_at, is_visible')
      .or('is_visible.is.null,is_visible.eq.true'),
    supabase
      .from('brands')
      .select('slug, updated_at, created_at')
      .order('name', { ascending: true }),
  ]);

  const now = new Date();

  // ---- Static / hand-curated routes ----
  // Grouped by editorial cadence so changeFrequency reads sensibly:
  //  - Home: daily (catalog + featured shifts often)
  //  - Listing surfaces (brands, bundles, best-seller, shop-199, k-plus): weekly
  //  - Help / About / Contact / FAQ / Services: monthly
  //  - Legal / Policies: yearly (reflects how often they actually change)
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },

    // Listing / discovery surfaces
    { url: `${SITE}/brands`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE}/bundles`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE}/best-seller`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE}/shop-199`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE}/k-plus`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },

    // Editorial / informational
    { url: `${SITE}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/services`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },

    // Legal / policies
    { url: `${SITE}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE}/policies/cancellation`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE}/policies/refunds`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE}/policies/replacements`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE}/policies/shipping-returns`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE}/policies/cookies`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // ---- Category routes (/c/<slug>) ----
  const categoryRoutes: MetadataRoute.Sitemap =
    (categories ?? []).map((c) => ({
      url: `${SITE}/c/${c.slug}`,
      lastModified: new Date(c.updated_at ?? c.created_at ?? Date.now()),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  // ---- Brand routes (/brand/<slug>) ----
  const brandRoutes: MetadataRoute.Sitemap =
    (brands ?? []).map((b) => ({
      url: `${SITE}/brand/${b.slug}`,
      lastModified: new Date(b.updated_at ?? b.created_at ?? Date.now()),
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

  // ---- Product routes (/products/<slug>) ----
  // Includes the hero image as a sitemap image extension. Google
  // surfaces this in Image search and uses it as a hint when picking
  // which image to show in product rich-results — beauty vertical
  // gets ~30% of its traffic from Google Images in India, so this is
  // not optional.
  const productRoutes: MetadataRoute.Sitemap =
    (products ?? []).map((p) => {
      const heroUrl = publicProductMediaUrl(p.hero_image_path);
      return {
        url: `${SITE}/products/${p.slug}`,
        lastModified: new Date(p.updated_at ?? p.created_at ?? Date.now()),
        changeFrequency: 'weekly',
        priority: 0.7,
        ...(heroUrl ? { images: [heroUrl] } : {}),
      };
    });

  return [...staticRoutes, ...brandRoutes, ...categoryRoutes, ...productRoutes];
}
