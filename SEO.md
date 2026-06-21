# SEO Audit & Action Plan

Living document for SEO work on madenkorea.com. Tracks audit findings, fix
status, and the off-site actions required to grow organic traffic.

- **Last audit:** 2026-05-08
- **Auditor:** Claude (codebase + config sweep, no live crawl yet)
- **Scope:** customer-facing routes only (admin / vendor / influencer dashboards excluded)

Mark items `[x]` as you complete them. Add a `Notes:` line under any item where the implementation differs from the recommendation. Re-audit quarterly.

---

## Status legend

- `[ ]` not started
- `[~]` in progress
- `[x]` shipped
- `[skip]` decided not to do (note why)

---

## Part 1 — Internal (in-codebase) gaps

### 🔴 P0 — Critical, ship first

#### 1. Root layout has no `metadata` export

- **File:** [app/layout.tsx](app/layout.tsx)
- **Problem:** No `metadata: Metadata` block at the root, so any page that doesn't define its own ships with empty `<title>` and missing OG. Default per-site metadata belongs here.
- **Fix:** Add a root `metadata` export with:
  - `metadataBase: new URL('https://madenkorea.com')`
  - `title: { default: "MadenKorea — Korean Beauty India", template: "%s | MadenKorea" }`
  - `description` (one-liner under 160 chars)
  - `applicationName`, `category: "ecommerce"`
  - Default `openGraph` (siteName, locale `en_IN`, type `website`, default image)
  - Default `twitter` card
  - `icons: { icon: '/favicon.ico', apple: '/apple-touch-icon.png' }`
  - `manifest: '/manifest.webmanifest'` (once we add one)
  - `formatDetection: { telephone: false, address: false, email: false }`
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** Added the root `metadata` block in [app/layout.tsx](app/layout.tsx). Manifest deferred to P3. Home page metadata still overrides where set.

#### 2. ~30 customer pages missing metadata

These pages currently have no `metadata` or `generateMetadata`. Each needs either real metadata (indexable pages) or `robots: { index: false, follow: false }` (transactional/private pages).

**Indexable — needs full metadata:**

- `[x]` [/contact](app/contact/page.tsx) — via [app/contact/layout.tsx](app/contact/layout.tsx)
- `[x]` [/terms](app/terms/page.tsx) — direct metadata
- `[x]` [/best-seller](app/best-seller/page.tsx) — via [app/best-seller/layout.tsx](app/best-seller/layout.tsx)
- `[x]` [/bundles](app/bundles/page.tsx) — via [app/bundles/layout.tsx](app/bundles/layout.tsx)
- `[x]` [/shop-199](app/shop-199/page.tsx) — via [app/shop-199/layout.tsx](app/shop-199/layout.tsx)
- `[x]` [/services](app/services/page.tsx) — direct metadata
- `[x]` [/k-plus](app/k-plus/page.tsx) — via [app/k-plus/layout.tsx](app/k-plus/layout.tsx)
- `[x]` [/brands](app/brands/page.tsx) — enriched existing metadata (canonical, OG, Twitter)

**Should be `noindex` — needs `robots: { index: false }`:**

- `[x]` [/cart](app/cart/page.tsx) — via [app/cart/layout.tsx](app/cart/layout.tsx)
- `[x]` [/checkout](app/checkout/page.tsx) — direct metadata
- `[x]` [/search](app/search/page.tsx) — direct metadata (`follow: true` so internal links propagate)
- `[x]` /account/** — via [app/account/layout.tsx](app/account/layout.tsx) (covers /account, /orders, /orders/[id], /orders/[id]/invoice, /settings, /wishlist)
- `[x]` /auth/** — via [app/auth/layout.tsx](app/auth/layout.tsx) (covers login/register/forgot/reset/callback)
- `[x]` /order/** — via [app/order/layout.tsx](app/order/layout.tsx) (covers success/failure)
- `[x]` /influencer/** — added metadata to existing [app/influencer/layout.tsx](app/influencer/layout.tsx)
- `[x]` [/influencer-request](app/influencer-request/page.tsx) — via [app/influencer-request/layout.tsx](app/influencer-request/layout.tsx)
- `[x]` [/legal/facebook-data-deletion](app/legal/facebook-data-deletion/page.tsx) — direct metadata

**Notes:** shipped 2026-05-08. Used segment layouts wherever ≥2 pages share the same noindex semantics (auth, account, order). Standalone client-component pages got per-route `layout.tsx` shells. Existing `/influencer` segment layout was patched in place. Indexable-page descriptions are placeholders — refine copy as the brand voice solidifies.

#### 3. Product JSON-LD is incomplete

- **File:** [app/products/[slug]/page.tsx:183](app/products/[slug]/page.tsx#L183)
- **Problem:** Current schema only has name/description/image/brand/offer.price. Missing the fields Google rich-results actually rewards.
- **Fix — add to the `ld` object:**
  - `[x]` `offers.availability` — InStock / OutOfStock based on `stock_qty`
  - `[x]` `offers.itemCondition: "https://schema.org/NewCondition"`
  - `[x]` `offers.priceValidUntil` — uses `sale_ends_at` if active, else 1 year out
  - `[x]` `sku` — uses `prod.sku || prod.id`
  - `[skip]` `gtin13` / `mpn` — no reliable column today; revisit when admin captures these
  - `[x]` `aggregateRating` — from `product_review_stats` view; only emitted when `rating_count > 0`
  - `[skip]` `review` (individual review entries) — privacy/PII review; aggregateRating alone is sufficient for stars in SERP
  - `[x]` `hasMerchantReturnPolicy` — 7-day, free-return, return-by-mail (mirrors `/policies/replacements`)
  - `[x]` `offers.shippingDetails` — two-tier: ₹149 below DELIVERY_THRESHOLD, free at/above
  - `[x]` Multiple `image` entries — hero + gallery from `product_images` (top 8 by sort order)
  - `[x]` Bonus: `countryOfOrigin` (KR when `made_in_korea` or column starts with "KOREA"), `additionalProperty` (volume_ml, net_weight_g), `seller: Organization`, `productID`
- **Reference:** [Google Product schema guide](https://developers.google.com/search/docs/appearance/structured-data/product)
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** Added two new `unstable_cache`-wrapped fetches (`getProductImagePaths`, `getProductReviewStats`) running in `Promise.all` alongside `getStoryBlocksForProduct`. Existing TS warnings on `prod.brands?.name` remained from a Supabase FK-array typing quirk — pre-existing, not introduced by this fix. Validate every key product page in [Rich Results Test](https://search.google.com/test/rich-results) once deployed; then add `gtin13` and individual `review` blocks if/when the data captures support them.

#### 4. No Organization / WebSite / BreadcrumbList schema

- **Problem:** Zero presence of these schemas means Google can't:
  - Associate domain with social profiles & logo (Knowledge Graph eligibility)
  - Show sitelinks search box in SERPs (`WebSite` `SearchAction`)
  - Show breadcrumb path in SERPs instead of raw URL
- **Fix:**
  - `[x]` `Organization` JSON-LD — via [components/SiteJsonLd.tsx](components/SiteJsonLd.tsx), mounted in [app/layout.tsx](app/layout.tsx). Includes logo, sameAs (Facebook/Instagram/YouTube/Threads), contactPoint (info@madenkorea.com + +91 9384857587, areaServed IN, languages EN/HI)
  - `[x]` `WebSite` JSON-LD with `SearchAction` — same component, bundled in `@graph`. Sitelinks search box should now be eligible after Google indexes the change
  - `[x]` `BreadcrumbList` JSON-LD on product, category, brand pages — via [components/BreadcrumbJsonLd.tsx](components/BreadcrumbJsonLd.tsx)
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** Organization + WebSite combined into one `<script>` via `@graph`. Product breadcrumbs use `Home > Brand > Product` (brand-led, since categories aren't surfaced in PDP header today). Pre-existing TS warnings on `prod.brands?` continued — same Supabase FK-array typing quirk as P0 #3, no new runtime issue.

---

### 🟠 P1 — High priority

#### 5. Sitemap is incomplete

- **File:** [app/sitemap.ts](app/sitemap.ts)
- **Problem:** Comment even reads "add /contact, /returns, etc." — never done.
- **Missing routes:**
  - `[x]` `/contact`, `/faq`, `/terms`
  - `[x]` All five `/policies/*` (cancellation, refunds, replacements, shipping-returns, cookies)
  - `[x]` `/brand/[slug]` (loops all brands from the `brands` table)
  - `[x]` `/brands`, `/bundles`, `/best-seller`, `/k-plus`
  - `[x]` Bonus: `/shop-199`, `/services` (CDSCO regulatory page)
- **Image extensions:**
  - `[x]` Hero image emitted as `images: [heroUrl]` per product entry — Next.js translates this to `<image:loc>` automatically
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** Sitemap now grouped by editorial cadence (home daily, listings weekly, info monthly, legal yearly). Brand routes pulled from `brands` table ordered by name. ~~Image extensions~~ wired via the `images` field on `MetadataRoute.Sitemap` entries; resolves Supabase storage paths to public URLs via a small helper. Re-verify after first crawl that brand pages without products don't surface 0-product UX (we still emit them; if that's a problem add a `having products > 0` filter to the brand query).

#### 6. Robots.txt syntax issue

- **File:** [app/robots.ts](app/robots.ts)
- **Problem:** `disallow: '/search?'` — the `?` is treated literally; this rule never matches.
- **Fix:** `[x]` Replaced `/search?` with `/search`. Added the segments we noindex'd in P0 #2: `/auth/`, `/order/`, `/influencer/`, `/influencer-request`, `/vendor/`, `/legal/`. Also added `/r/`, `/rl/` (referral redirects), `/product/` (legacy 307), `/debug/`. Cleaned up the dev-mode rule (was `disallow: ['/', '/']` — duplicate).
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** Disallow list extracted to a `PROD_DISALLOW` constant for readability. Documented in code that robots.txt is a *crawl* directive — page-level `noindex` (P0 #2) is what actually controls indexing.

#### 7. Homepage keyword stuffing

- **File:** [app/page.tsx:25-112](app/page.tsx#L25)
- **Problem:** 80+ entries in `keywords` array. Google has ignored `<meta keywords>` since 2009; bulk lists can be a quality-signal *negative* for some crawlers.
- **Fix:** `[x]` Trimmed to 7 distinctive terms: `MadenKorea`, `K-beauty`, `Korean beauty India`, `Korean skincare`, `authentic Korean brands`, `buy Korean skincare online`, `consumer innovations`.
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** Long-tail discoverability now lives in actual page copy and on dedicated category / brand pages where it belongs — not in this tag. Code comment added explaining the rationale so future contributors don't re-bloat the list.

#### 8. `lang="en"` should be `lang="en-IN"`

- **File:** [app/layout.tsx:30](app/layout.tsx#L30)
- **Problem:** We target India in INR but declare a generic English locale.
- **Fix:** `[x]` Changed `<html lang="en">` to `<html lang="en-IN">`. OG `locale: "en_IN"` was already set in the root metadata block (P0 #1) so the SiteJsonLd, OG, and html `lang` are all aligned now.
- **Status:** `[x]` shipped 2026-05-08

#### 9. No `hreflang` alternates

- **Problem:** Even single-locale sites benefit from declaring intent.
- **Fix:** `[x]` Added `languages: { "en-IN": ..., "x-default": ... }` to root metadata `alternates` in [app/layout.tsx](app/layout.tsx). Both point at the same URL today; if/when we serve alternate-language variants, this map is the place to expand.
- **Status:** `[x]` shipped 2026-05-08

---

### 🟡 P2 — Medium priority

#### 10. Image SEO

- `[x]` `priority` set on the PDP LCP image — `priority={selectedImage === 0}` so only the initial paint gets `fetchpriority="high"`; thumbnail swaps fetch normally. Also added `sizes="(max-width: 1024px) 100vw, 50vw"` to match actual rendered widths.
- `[x]` `alt=""` audit — checked all 25 instances. Customer-facing components (ProductCard, CompactProductCard, BrandCarousel, HeroBanner, Header) all have real alt text already. Footer logos with `aria-hidden="true"` are correctly empty (decorative — `<h3>MadenKorea</h3>` next to them is the accessible name). Admin previews (ProductStoryEditor, FocalPointPicker, ProductEditor) are non-public, no SEO impact. Only customer-facing fix was [VideoReel.tsx](components/home/VideoReel.tsx) thumbnail — changed `alt=""` to `"Product video preview"`.
- `[x]` Pinned `images.formats: ["image/avif", "image/webp"]` in [next.config.js](next.config.js).
- `[~]` Cloudflare Images / Vercel edge — **deferred to infra decision**. Tracked in Part 2 (Performance & technical) of this doc.
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** Pre-existing TS errors on `Review.photos` property in product.tsx (lines 1961/1963) shifted from earlier 1954/1956 because of my added comment/props — not introduced by this fix.

#### 11. Two product URL paths — 307 vs 301

- **File:** ~~[app/product/[slug]/page.tsx](app/product/[slug]/page.tsx)~~ (deleted)
- **Problem:** Used Next.js `redirect()` which defaults to **307 (temporary)**. Google doesn't fully consolidate link equity on temp redirects.
- **Fix:** `[x]` Added `redirects()` to [next.config.js](next.config.js) with `permanent: true` (emits **308**, the RFC permanent equivalent of 307; Google treats 308 and 301 as identical for link-equity consolidation). Deleted the old `app/product/` folder so the config-level redirect takes over (file-system routes win over config redirects in Next.js).
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** Verified no internal links point at the legacy `/product/<slug>` singular path — the 308 only serves external backlinks and old bookmarks. Query strings preserved automatically through the parameterised redirect.

#### 12. Build ignores type & lint errors

- **File:** [next.config.js:25-30](next.config.js#L25)
- **Problem:** `ignoreBuildErrors: true` + `ignoreDuringBuilds: true`. Not direct SEO, but means broken links / missing `alt` props / accidentally-undefined metadata fields ship to prod silently.
- **Status:** `[~]` partial — dead code purged, but flipping the flags is blocked on remaining real errors.

**What was done (2026-05-08):**

- Deleted `components/admin/ProductForm v-1.tsx` and `v-2.tsx` (CLAUDE.md flagged them as deletion candidates contributing typecheck noise; not imported anywhere).
- After deletion: typecheck reports **96 errors across ~30 files**, lint reports **13 errors + ~12 warnings**. Flipping the flags off today would block every deploy.

**What's blocking flag flip:**

| Bucket | Approx count | Examples |
|---|---|---|
| Supabase FK array typing (`{ name }` vs `{ name }[]`) | ~10 | `prod.brands?.name` in product/category/brand pages |
| Admin Supabase queries hitting tables not in generated types | ~25 | `app/admin/cms/*`, `app/admin/whatsapp/*`, `app/admin/orders/*` |
| Vendor portal — `UserRole` doesn't include `"vendor"`, `SessionUser.name` missing | ~12 | `app/vendor/(protected)/**/page.tsx` |
| Misc: `Review.photos`, `lib/banners.ts` missing module, `Set<>` iteration target | ~10 | Various |
| Supabase edge functions (Deno imports, `Deno` global) | ~12 | `supabase/functions/*` — separate runtime, not bundled by Next, can be excluded via `tsconfig.json` |
| ESLint `rules-of-hooks` (real bug class — hooks called conditionally) | 6 | `BrandCarousel.tsx`, `VendorGate.tsx` |
| ESLint `no-unescaped-entities` (trivial fix) | 7 | `app/search/page.tsx`, `SearchAutocomplete.tsx`, `ProductEditor.tsx` |

**Recommended next steps (separate work items, ordered by impact):**

1. **`[ ]` Add a CI deploy gate** — run `npm run typecheck && npm run lint` as a non-blocking warning step in Vercel/GitHub Actions. Captures regressions without breaking deploys today. *This is the pragmatic SEO win*: the moment a new metadata field has a typo, CI catches it before prod.
2. **`[ ]` Fix React `rules-of-hooks` violations** — these are real bugs. Conditionally-called hooks can desync the hook order between renders.
3. **`[ ]` Exclude Supabase edge functions from the Next typecheck** — add `"exclude": ["supabase/functions"]` to `tsconfig.json`. They run on Deno, not Node; Next shouldn't typecheck them.
4. **`[ ]` Regenerate Supabase types** — the FK-array quirk and "table not in types" bucket would mostly resolve if types were regenerated against the live schema (`supabase gen types typescript`).
5. **`[ ]` Once 1-4 are done, flip the flags** — `ignoreBuildErrors: false`, `ignoreDuringBuilds: false`. Then real errors block prod, which is the steady-state goal.

#### 13. No custom 404 page

- **Problem:** Next.js default 404 is bare. Custom 404 with internal links to popular categories keeps visitors on-site (lower bounce → SEO signal).
- **Fix:** `[x]` Rewrote [app/not-found.tsx](app/not-found.tsx). The previous version was `'use client'`, lacked header/footer, had no metadata, and linked to a non-existent `/products` route. New version:
  - Server component (drops client JS) wrapped in `<CustomerLayout>` (consistent header + footer)
  - `metadata: { title: "Page not found", robots: { index: false, follow: true } }`
  - Inline pure-HTML search form posting GET to `/search?q=...` (no JS required)
  - 8 evergreen popular destinations: Bestsellers, All brands, Bundles, Shop @ ₹199, K Plus, FAQ, Contact, About
  - "Back to home" CTA
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** Destinations are deliberately static (no DB fetch) — 404 should be lightweight and these surfaces are evergreen. Next.js auto-emits HTTP 404 for this file, so crawlers see the correct status and follow links to recover.

#### 14. No `viewport` export

- **Problem:** Next 14 has a default but explicit is more discoverable.
- **Fix:** `[x]` Added explicit `viewport` export to [app/layout.tsx](app/layout.tsx):
  ```ts
  export const viewport: Viewport = {
    themeColor: "#359fd9",   // matches footer brand colour
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",     // edge-to-edge on iOS notched devices
  };
  ```
- **Status:** `[x]` shipped 2026-05-08
- **Notes:** `themeColor` matches the footer's brand blue (`rgb(53, 159, 217)`) so mobile browser chrome (Android Chrome, iOS Safari standalone) reads as a continuation of the brand surface. Added `viewportFit: "cover"` as a small bonus — lets PWA-style installs render edge-to-edge on iOS notched devices.

#### 15. URL hygiene — trailingSlash

- **Problem:** [next.config.js](next.config.js) doesn't set `trailingSlash`. Both `/about` and `/about/` resolve, creating duplicate-content risk if ever linked inconsistently.
- **Fix:** `[x]` Pinned `trailingSlash: false` in [next.config.js](next.config.js). All canonical URLs across the site (alternates, sitemap, internal Links) already use the no-slash form, so this matches existing convention. Next.js automatically emits a 308 redirect from `/about/` → `/about`, consolidating link equity to the canonical variant.
- **Status:** `[x]` shipped 2026-05-08

---

### 🟢 P3 — Polish

- `[x]` **PWA manifest** — created [app/manifest.ts](app/manifest.ts) (Next auto-serves at `/manifest.webmanifest`). Explicit `manifest: "/manifest.webmanifest"` reference added to root metadata. Reuses existing `square-logo.png` + `apple-touch-icon.png`.
- `[x]` **Preconnect** — Supabase storage host preconnected via `<head>` in [app/layout.tsx](app/layout.tsx). Google Fonts skipped because Next 14's `next/font/google` self-hosts in production. Razorpay skipped because it's `lazyOnload` (not LCP-relevant).
- `[x]` `themeColor` declared — done as part of P2 #14 viewport export
- `[x]` **FAQPage JSON-LD** on [/faq](app/faq/page.tsx) — every Q+A from `sections[].items[]` is rendered to a `Question`/`Answer` pair using a plain-text `aText` twin alongside the JSX answer. Initially tried `renderToStaticMarkup` to serialise JSX, but Next.js blocks `react-dom/server` imports in route files (potential client-bundle leak). Maintaining the text twin is conceptually cleaner anyway.
- `[x]` Lower `changeFrequency` hints on Privacy/Terms/Policies in sitemap — done as part of P1 #5 (set to "yearly")
- `[x]` **`prefers-reduced-motion`** on the homepage video carousel — added a `useReducedMotion()` hook in [components/home/VideoReel.tsx](components/home/VideoReel.tsx). When enabled: 4-second carousel auto-tick is suppressed, and per-card video autoplay is disabled (poster frame only — modal click still plays on demand). Listens to `MediaQueryList.change` so toggling the OS pref takes effect without reload.

**Status:** all 6 items shipped 2026-05-08. P3 complete.

---

## Part 2 — External (off-site) actions

### Search infrastructure (week 1)

- `[ ]` **Google Search Console** — verify madenkorea.com (DNS TXT or HTML file). Submit `https://madenkorea.com/sitemap.xml`. Monitor Coverage, Core Web Vitals, manual actions.
- `[ ]` **Bing Webmaster Tools** — same. ~10% of Indian search traffic, often underused.
- `[ ]` **Google Merchant Center** — free product listings on Google Shopping. Feed pulled from Product schema. *Single biggest external lever for Indian e-comm beauty.*
- `[ ]` **Google Business Profile** — even pure-online retailers benefit (knowledge panel, reviews). List Chennai HQ.
- `[ ]` **Pinterest Business + Verify domain** — beauty/skincare drives huge Pinterest traffic in India. Rich Pins use Product schema automatically once verified.

### Authority & trust signals (week 2-4)

- `[ ]` **Trustpilot** — set up profile, embed widget on product pages, push post-purchase email asking for review
- `[ ]` **Google reviews** — solicit via post-purchase WhatsApp / email
- `[ ]` **Backlinks — bloggers / YouTubers**
  - K-beauty India creators: Anubha Bhonsle, Komal Pandey, Diipa Khosla niche, etc.
  - Send PR samples in exchange for honest reviews + backlink
- `[ ]` **Backlinks — publications**
  - Vogue India, Cosmopolitan India, MissMalini, Femina — pitch guest posts on K-beauty trends
- `[ ]` **"Best K-beauty stores in India" roundups** — pitch to be included
- `[ ]` **Brand authorized-reseller pages** — when COSRX, Beauty of Joseon, Anua list India resellers, push to be on those lists
- `[ ]` **Wikipedia / Wikidata** — register the company entity on Wikidata (eligibility-friendly). Feeds into Google Knowledge Graph.

### Content engine (month 1+)

- `[ ]` **Blog at `/blog`** — K-beauty routines, ingredient deep-dives, "How to layer Korean skincare", concern-based guides. Each post → 5–10 internal links to relevant products.
- `[ ]` **YouTube channel** — embed videos on product pages (video infra already exists). YouTube ranks in Google SERPs *and* drives direct traffic.
- `[ ]` **Editorial calendar** — minimum 2 posts/week for first 6 months
- `[ ]` **Hindi/Hinglish long-tail** — embed Devanagari names ("ब्यूटी ऑफ जोसन सनस्क्रीन") in body of flagship products. Hinglish queries are huge in Tier 2/3.

### Performance & technical (ongoing)

- `[ ]` **PageSpeed Insights** — run for `/`, a category, a product, a policy page. Aim for LCP < 2.5s, INP < 200ms, CLS < 0.1.
- `[ ]` **Rich Results Test** — validate every key page after schema changes
- `[ ]` **Screaming Frog crawl** (free up to 500 URLs) — find broken links, missing alts, duplicate titles, orphan pages, redirect chains
- `[ ]` **GA4 ↔ Search Console linkage** — see organic queries driving conversions
- `[ ]` **CDN-hosted product images** — Cloudflare Images or Vercel Image Optimization for non-metro LCP

### Local & Indian-specific (month 2+)

- `[ ]` **Indian aggregator listings** — Mouthshut, JustDial, Sulekha, Glassdoor (employer brand)
- `[ ]` **Founder profiles** — Tracxn, Inc42, YourStory drive branded search and trust signals
- `[ ]` **WhatsApp/Instagram link-in-bio** points to specific landing pages, not homepage. UTM-tag everything.
- `[ ]` **Korean tourism / cultural exchange** — partnerships → high-DA `.go.kr` or embassy links

---

## Recommended sequencing

| Week | Focus | Deliverables |
|------|-------|-------------|
| 1 | P0 internal (rows 1–4) | Root metadata, missing-metadata pages, enriched Product schema, Organization/WebSite/Breadcrumb JSON-LD |
| 2 | P1 internal (rows 5–9) + GSC/Bing/Merchant | Sitemap completeness, robots fix, en-IN, hreflang. External: search consoles + Merchant Center verified |
| 3 | P2 internal (rows 10–15) + Pinterest/Trustpilot | 301 redirects, 404 page, viewport, image audit. External: Pinterest verified, Trustpilot widget live |
| 4 | P3 polish + content kickoff | Manifest, FAQ schema, preconnects. External: blog skeleton + first 4 posts |
| Month 2+ | Backlinks, content cadence, paid+organic synergy | Ongoing |

---

## Tracking

When working on an item:
1. Flip `[ ]` → `[~]` and add `Notes: <PR/branch>` underneath
2. When merged, flip to `[x]` and update `Last audit:` date at top if you re-verified the section
3. Add new findings under their priority bucket — don't let this doc drift from reality

When SEO-relevant code changes ship outside this plan (e.g., a new public route is added), add a metadata checkbox here so we don't lose track.

---

## Related docs

- [CODEBASE_REFERENCE.md](CODEBASE_REFERENCE.md) — authoritative route map (use to find all public routes when extending the sitemap)
- [ANALYTICS.md](ANALYTICS.md) — first-party event log; pair with GA4 for full SEO conversion attribution
- [ISSUE_REGISTER.md](ISSUE_REGISTER.md) — link any SEO issues that block other fixes
