// app/page.tsx
import { cookies } from "next/headers";
import { CustomerLayout } from "@/components/CustomerLayout";
import { HeroBanner } from "@/components/home/HeroBanner";
import { getBanners } from "./_data/getBanners";
import { EditorialSection } from "@/components/home/EditorialSection";
import { BrandCarousel } from "@/components/home/BrandCarousel";
import { getBrandsForCarousel } from "./_data/getBrands";
import { InstagramVideoCarousel } from "@/components/home/InstagramVideoCarousel";
import { getInfluencerVideos } from "./_data/getInfluencerVideos";
import HomeVideoCarouselSection from "@/components/home/HomeVideoCarouselSection";
import { SkinAnalyzerPromoModal } from "@/components/home/SkinAnalyzerPromoModal";
import CertificationSwiper from "@/components/Cetifications";
import { getTranslations, getLocale } from "next-intl/server";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";
import {
  mergeTranslations,
  PRODUCT_TRANSLATABLE_FIELDS,
} from "@/lib/contentTranslations";
import { getHomeVideoLimit } from "@/lib/storeSettings";
import { resolveMediaUrl } from "@/lib/storage/backend";
import type { Metadata } from "next";

const SITE_URL = "https://madenkorea.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MadenKorea - Consumer Innovations",
    template: "%s | MadenKorea",
  },
  description:
    "Discover trending Korean skincare, personal care, and lifestyle products. K-beauty brands, curated drops, and the latest consumer innovations from Korea.",
  // Trimmed from 80+ entries to 7 distinctive terms. Google has ignored
  // <meta keywords> since 2009; bulk lists can be a quality-signal
  // negative for some crawlers. Long-tail discoverability lives in the
  // actual page copy and on dedicated category / brand / blog pages —
  // not in this tag.
  keywords: [
    "MadenKorea",
    "K-beauty",
    "Korean beauty India",
    "Korean skincare",
    "authentic Korean brands",
    "buy Korean skincare online",
    "consumer innovations",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "MadenKorea",
    title: "MadenKorea - Consumer Innovations",
    description:
      "Shop Korean beauty, personal care, and lifestyle products curated for you.",
    images: [
      {
        url: "/logo-md.png",
        width: 1200,
        height: 630,
        alt: "MadenKorea homepage",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MadenKorea - Korean Beauty & Consumer Innovations",
    description:
      "Shop authentic Korean beauty, personal care, and lifestyle products curated for you.",
    images: ["/logo-md.png"],
  },
  icons: {
    icon: "/favicon.ico",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  applicationName: "MadenKorea",
  category: "ecommerce",
  other: {
    "format-detection": "telephone=no, address=no, email=no",
  },
};

export const revalidate = 30; // ISR: refresh the home data every 5 minutes

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  return resolveMediaUrl("product-media", path) ?? null;
}

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
  effective_price?: number | null; // Phase 1 country-aware offer
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  new_until?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  stock_qty?: number | null;
  hero_image_path?: string | null;
  hero_image_url?: string | null; // added for SEO / schema image
  brands?: { name?: string | null } | null;
};

async function fetchEditorial(
  kind: "featured" | "trending",
  locale: string,
  country: string,
  limit = 8
): Promise<CardProduct[]> {
  const { getEditorialProducts } = await import("@/lib/data/catalog");
  const data: any[] = await getEditorialProducts(kind, limit);

  // Merge translated short_description for the active locale, then
  // attach the public image URL. Product names stay canonical English.
  // (Images still resolve from Supabase Storage until the S3 phase.)
  const translated = mergeTranslations(
    data,
    locale,
    PRODUCT_TRANSLATABLE_FIELDS,
    "product_translations"
  );
  const withImages = translated.map((p) => ({
    ...p,
    hero_image_url: storagePublicUrl(p.hero_image_path) ?? undefined,
  })) as CardProduct[];

  // Phase 1 country offers — augment with country-specific effective_price.
  const { applyCountryOffers } = await import("@/lib/data/catalog");
  return await applyCountryOffers(withImages, country);
}

export default async function Home() {
  const t = await getTranslations("home");
  const locale = await getLocale();

  // Active country is whatever the country switcher / geo seeded into
  // `mik_country` (middleware writes it on first visit). Banners are
  // scoped per country with a strict India fallback inside getBanners.
  const cookieCountry = cookies().get("mik_country")?.value;
  const country = isSupportedCountry(cookieCountry) ? cookieCountry : DEFAULT_COUNTRY;

  const [
    banners,
    brands,
    influencerVideos,
    trendingProducts,
    featuredProducts,
    homeVideoLimit,
  ] = await Promise.all([
    getBanners("home", country),
    getBrandsForCarousel("site-assets"),
    getInfluencerVideos("home", 12),
    fetchEditorial("trending", locale, country, 8),
    fetchEditorial("featured", locale, country, 8),
    // Admin-configurable cap for the product-video carousel. Stored in
    // `store_settings.home_video_limit`, editable from
    // /admin/cms/product-video. Read in parallel with the rest of the
    // home data so it adds no critical-path latency.
    getHomeVideoLimit(),
  ]);

  // --- JSON-LD (Google schema) for home + featured products ---

  const homeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}#website`,
        url: SITE_URL,
        name: "MadenKorea",
        description:
          "MadenKorea is a curated marketplace for Korean beauty, skincare, personal care, and lifestyle products.",
        inLanguage: "en-IN",
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}#organization`,
        name: "MadenKorea",
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/logo-md.png`,
        },
      },
    ],
  };

  const productGraph =
    featuredProducts.length > 0
      ? featuredProducts.map((p) => {
          const price = p.sale_price ?? p.price ?? null;
          const currency = p.currency ?? "INR";

          return {
            "@type": "Product",
            "@id": `${SITE_URL}/products/${p.slug}#product`,
            name: p.name,
            image: p.hero_image_url
              ? [p.hero_image_url.startsWith("http")
                  ? p.hero_image_url
                  : `${SITE_URL}${p.hero_image_url}`]
              : undefined,
            description: p.short_description ?? undefined,
            brand: p.brands?.name
              ? { "@type": "Brand", name: p.brands.name }
              : undefined,
            sku: p.id,
            url: `${SITE_URL}/products/${p.slug}`,
            offers:
              price !== null
                ? {
                    "@type": "Offer",
                    priceCurrency: currency,
                    price: price.toString(),
                    availability: "https://schema.org/InStock",
                    url: `${SITE_URL}/products/${p.slug}`,
                  }
                : undefined,
          };
        })
      : [];

  const productJsonLd =
    productGraph.length > 0
      ? {
          "@context": "https://schema.org",
          "@graph": productGraph,
        }
      : null;

  return (
    <>
      {/* SEO: main page & organization schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      {/* SEO: featured product schema for Google rich results */}
      {productJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}

      {/* Home-only marketing pop-up for the AI Skin Analyzer (frequency-capped) */}
      <SkinAnalyzerPromoModal />

      <CustomerLayout>
        <HeroBanner banners={banners} />

        <div className="container mx-auto py-12 space-y-16">
          {/* Trending from Supabase */}
          {trendingProducts.length > 0 && (
            <EditorialSection
              title={t("trendingTitle")}
              description={t("trendingDescription")}
              products={trendingProducts}
            />
          )}

          {/* Keep existing Best Sellers (mock) if needed */}
          {/* {bestsellerProducts.length > 0 && (
            <EditorialSection
              title="Best Sellers"
              description="Customer favorites and top-rated products"
              products={bestsellerProducts.slice(0, 8) as any}
            />
          )} */}
{/* <KPlusPromoBanner /> */}
          {/* Cap comes from `store_settings.home_video_limit`, editable
              at /admin/cms/product-video. Carousel is horizontally
              paginated so larger limits just add pages — admins control
              order via the `position` column. */}
          <HomeVideoCarouselSection pageScope="home" limit={homeVideoLimit} />

          <BrandCarousel brands={brands} />

          {/* {newArrivalProducts.length > 0 && (
            <EditorialSection
              title="New Arrivals"
              description="Fresh from Korea: Latest beauty innovations"
              products={newArrivalProducts.slice(0, 8) as any}
            />
          )} */}

          {/* Featured from Supabase */}
          {featuredProducts.length > 0 && (
            <EditorialSection
              title={t("featuredTitle")}
              description={t("featuredDescription")}
              products={featuredProducts}
            />
          )}

          {influencerVideos.length > 0 && (
            <InstagramVideoCarousel videos={influencerVideos} />
          )}
          <CertificationSwiper />
        </div>
      </CustomerLayout>
    </>
  );
}

