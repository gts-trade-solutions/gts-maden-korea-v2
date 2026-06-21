import "./globals.css";
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { isSupportedCurrency, type CurrencyCode } from "@/lib/currency";
import { AuthProvider } from "@/lib/contexts/AuthContext";
import { NextAuthProvider } from "@/components/NextAuthProvider";
import { CartProvider } from "@/lib/contexts/CartContext";
import { WishlistProvider } from "@/lib/contexts/WishlistContext";
import { CookieConsentProvider } from "@/lib/contexts/CookieConsentContext";
import { CurrencyProvider } from "@/lib/contexts/CurrencyContext";
import { LocaleProvider } from "@/lib/contexts/LocaleContext";
import { CountryProvider } from "@/lib/contexts/CountryContext";
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/locales";
import {
  DEFAULT_COUNTRY,
  isSupportedCountry,
  type CountryCode,
} from "@/lib/countries";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import Script from "next/script";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { AnalyticsBootstrap } from "@/components/AnalyticsBootstrap";
import { AnalyticsScripts } from "@/components/AnalyticsScripts";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { CountryGate } from "@/components/CountryGate";
import { SiteJsonLd } from "@/components/SiteJsonLd";
import {
  WHATSAPP_DEFAULT_MESSAGE,
  WHATSAPP_PHONE_NUMBER,
} from "@/lib/config/site";

const inter = Inter({ subsets: ["latin"] });

// Sitewide viewport. Next 14 ships a sensible default, but declaring
// it explicitly makes the values discoverable in diff/audit and lets
// us set `themeColor` for mobile browser chrome (Android Chrome,
// iOS Safari standalone). The colour matches the footer background
// (rgb(53,159,217)) so the chrome reads as the brand surface.
export const viewport: Viewport = {
  themeColor: "#359fd9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Sitewide metadata defaults. Pages that export their own metadata
// (home, products, categories, brands, policies, about, etc.) override
// these on a per-field basis — Next merges layout + page metadata. Pages
// that don't define metadata at all (auth, account, cart, checkout, etc.)
// inherit these as their visible head content.
//
// Per-page note: transactional / private pages (cart, checkout, /account/*,
// /auth/*, /order/*, /search) should set `robots: { index: false, follow: false }`
// in their own metadata so they don't get indexed despite the global
// `index: true` here. Tracked in SEO.md P0 item 2.
export const metadata: Metadata = {
  metadataBase: new URL("https://madenkorea.com"),
  title: {
    default: "MadenKorea — Authentic Korean Beauty in India",
    template: "%s | MadenKorea",
  },
  description:
    "India's destination for authentic Korean beauty and lifestyle products. Curated K-beauty brands, fast delivery, 100% genuine sourcing.",
  applicationName: "MadenKorea",
  category: "ecommerce",
  alternates: {
    canonical: "https://madenkorea.com",
    // Even single-locale sites benefit from declaring intent. Tells
    // Google: "this site is for India." Both en-IN and x-default
    // point at the same URL because we don't currently serve
    // alternate-language variants.
    languages: {
      "en-IN": "https://madenkorea.com",
      "x-default": "https://madenkorea.com",
    },
  },
  openGraph: {
    type: "website",
    siteName: "MadenKorea",
    locale: "en_IN",
    url: "https://madenkorea.com",
    title: "MadenKorea — Authentic Korean Beauty in India",
    description:
      "India's destination for authentic Korean beauty and lifestyle products. Curated K-beauty brands, fast delivery, 100% genuine sourcing.",
    images: [
      {
        url: "/logo-md.png",
        width: 1200,
        height: 630,
        alt: "MadenKorea",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MadenKorea — Authentic Korean Beauty in India",
    description:
      "India's destination for authentic Korean beauty and lifestyle products. Curated K-beauty brands, fast delivery, 100% genuine sourcing.",
    images: ["/logo-md.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
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
};


// Hostname for the Supabase storage bucket that serves all product
// imagery. Resolved at build time so we can preconnect early and shave
// a round trip off LCP. Falls back to a safe placeholder hostname if
// the env var is missing — preconnect to a non-existent host is a
// no-op, not an error.
const SUPABASE_STORAGE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the visitor preference cookies that middleware seeds on
  // first visit (and the CountrySwitcher rewrites on change).
  // Passing them through to the providers keeps SSR HTML aligned
  // with the client's first render — without this, the server would
  // render INR / en-IN while the client reads the cookies and
  // re-renders the user's actual currency + locale, producing a
  // hydration mismatch.
  const cookieJar = cookies();

  const cookieCurrency = cookieJar.get("mik_currency")?.value;
  const initialCurrency: CurrencyCode = isSupportedCurrency(cookieCurrency)
    ? cookieCurrency
    : "INR";

  const cookieLocale = cookieJar.get("mik_locale")?.value;
  const initialLocale: SupportedLocale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : DEFAULT_LOCALE;

  const cookieCountry = cookieJar.get("mik_country")?.value;
  const initialCountry: CountryCode = isSupportedCountry(cookieCountry)
    ? cookieCountry
    : DEFAULT_COUNTRY;

  // next-intl handshake. `getLocale()` reads via our `getRequestConfig`
  // in i18n/request.ts (which itself reads the `mik_locale` cookie),
  // so this matches `initialLocale` above by construction. We pass
  // both through anyway so the client provider is independently
  // satisfied without a server round-trip.
  const locale = await getLocale();
  const messages = await getMessages();

  // `<html lang>` must match Intl tag, not our internal code (e.g.
  // "en-IN" stays as-is but "pl" → "pl-PL", "vi" → "vi-VN") so
  // screen readers + Google use the right pronunciation/region.
  const htmlLang = LOCALE_INFO[initialLocale]?.intlTag ?? "en-IN";

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <head>
        {/* Preconnect to the Supabase storage host so the TLS / DNS
            handshakes happen in parallel with HTML parsing. Every
            product image, hero banner, and brand logo on the site is
            served from this origin, so the first image fetch lands
            ~100-300ms sooner on cold connections. */}
        {SUPABASE_STORAGE_HOST && (
          <>
            <link rel="preconnect" href={`https://${SUPABASE_STORAGE_HOST}`} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={`https://${SUPABASE_STORAGE_HOST}`} />
          </>
        )}
      </head>
      <body className={`${inter.className} overflow-x-clip`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="madenkorea-theme"
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            <LocaleProvider initialLocale={initialLocale}>
            <CountryProvider initialCountry={initialCountry}>
              <NextAuthProvider>
              <AuthProvider>
                <CookieConsentProvider>
                  <CurrencyProvider initialCurrency={initialCurrency}>
                  <CartProvider>
                    <WishlistProvider>
                      {/* Google Analytics — only loads once the user grants
                          "Analytics" consent through the banner. No GA cookies
                          or requests until that happens. */}
                      <AnalyticsScripts />
                      <Suspense fallback={null}>
                        <AnalyticsBootstrap />
                      </Suspense>
                      {children}
                      {/* Forces signed-in users without a
                          preferred_country to pick one before they
                          can use the app. Renders nothing for anon
                          visitors and on /auth/* routes. */}
                      <CountryGate />
                      <FloatingWhatsApp
                        phoneNumber={WHATSAPP_PHONE_NUMBER}
                        message={WHATSAPP_DEFAULT_MESSAGE}
                      />
                      {/* Top-center positioning so toasts never overlap
                          bottom-anchored UI (PDP MobileBuyBar, Floating
                          WhatsApp). Modern pattern (Apple/Linear/Vercel) and
                          avoids the sticky-bar conflict on every page, not
                          just the PDP. */}
                      <Toaster position="top-center" />
                      <CookieConsentBanner />
                    </WishlistProvider>
                  </CartProvider>
                  </CurrencyProvider>
                </CookieConsentProvider>
              </AuthProvider>
              </NextAuthProvider>
            </CountryProvider>
            </LocaleProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
        {/* Organization + WebSite JSON-LD. One script tag, fixed content
            — Next will hoist it into the static HTML at build/render
            time so Googlebot sees it without executing JS. */}
        <SiteJsonLd />
      </body>
    </html>
  );
}
