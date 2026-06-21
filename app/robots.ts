// app/robots.ts
import type { MetadataRoute } from 'next';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://madenkorea.com').replace(/\/$/, '');

// Robots blocking is a *crawl* directive, not an *indexing* directive —
// pages disallowed here can still be indexed if Google discovers them
// through external backlinks. Page-level `robots: { index: false }`
// (set in metadata) is what actually keeps a URL out of search results.
//
// Use this list to save crawl budget on routes that have no value to
// search engines: APIs, admin/account/vendor portals, transactional
// surfaces (cart, checkout, order status), short-lived redirects
// (referral codes, legacy product paths), and search results pages
// whose content is already accessible through indexable category and
// product pages.
const PROD_DISALLOW = [
  '/api/',
  '/admin/',
  '/account/',
  '/auth/',
  '/cart',
  '/checkout/',
  '/order/',
  '/influencer/',
  '/influencer-request',
  '/vendor/',
  '/legal/',
  '/search',
  '/r/',
  '/rl/',
  '/product/', // legacy 307 redirect to /products/<slug>
  '/debug/',
  '/_next/',
  '/static/',
  '/internal/',
];

export default function robots(): MetadataRoute.Robots {
  const isProd =
    process.env.NODE_ENV === 'production' &&
    (!process.env.VERCEL || process.env.VERCEL_ENV === 'production');

  // Block crawling on previews and local dev so we never accidentally
  // get a Vercel preview URL indexed.
  const rules = isProd
    ? { userAgent: '*', allow: '/', disallow: PROD_DISALLOW }
    : { userAgent: '*', disallow: '/' };

  return {
    rules,
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
