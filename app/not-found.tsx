import type { Metadata } from "next";
import Link from "next/link";
import { Home, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerLayout } from "@/components/CustomerLayout";

// Standard 404. App Router renders this whenever:
//  - notFound() is called from a server component
//  - a route doesn't match any segment
// Next.js automatically responds with HTTP 404 for this file, so
// crawlers see the correct status and don't index it.
export const metadata: Metadata = {
  title: "Page not found",
  description:
    "The page you're looking for doesn't exist. Browse Korean beauty bestsellers, brands, and bundles instead.",
  robots: { index: false, follow: true },
};

// Curated quick-jump destinations. We deliberately avoid fetching live
// data here — 404 should be lightweight, and the destinations below
// are evergreen surfaces that won't disappear if a category slug
// changes. Server-side keeps this page free of client JS.
const POPULAR = [
  { label: "Bestsellers", href: "/best-seller" },
  { label: "All brands", href: "/brands" },
  { label: "Bundles", href: "/bundles" },
  { label: "Shop @ ₹199", href: "/shop-199" },
  { label: "K Plus membership", href: "/k-plus" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact us", href: "/contact" },
  { label: "About MadenKorea", href: "/about" },
];

export default function NotFound() {
  return (
    <CustomerLayout>
      <div className="container mx-auto py-16 sm:py-24">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-4">
            Error 404
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            We couldn&apos;t find that page
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground mb-10">
            The link may be broken or the page may have moved. Try searching, or
            jump to one of the destinations below.
          </p>

          {/* Inline search — pure HTML form, no JS needed. /search reads
              the `q` query parameter. */}
          <form
            action="/search"
            method="GET"
            role="search"
            className="flex gap-2 max-w-lg mx-auto mb-10"
          >
            <label htmlFor="not-found-search" className="sr-only">
              Search products
            </label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="not-found-search"
                type="search"
                name="q"
                placeholder="Search products, brands, ingredients..."
                className="w-full h-11 rounded-md border border-input bg-background pl-10 pr-4 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                autoFocus
              />
            </div>
            <Button type="submit" size="lg">
              Search
            </Button>
          </form>

          {/* Popular destinations. Renders as a 2-col grid on mobile,
              4-col on desktop — keeps the visual weight balanced
              regardless of how many entries we add. */}
          <div className="text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground text-center mb-4">
              Popular destinations
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {POPULAR.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="
                    group flex items-center gap-2 rounded-xl border bg-background p-4
                    text-sm font-medium hover:border-primary/40 hover:bg-muted/50
                    transition-colors
                  "
                >
                  <Sparkles className="h-4 w-4 text-primary/60 group-hover:text-primary" />
                  <span className="truncate">{label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/">
                <Home className="mr-2 h-5 w-5" />
                Back to home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
