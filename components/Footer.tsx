"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Facebook, Instagram, Youtube } from "lucide-react";
import { FaThreads } from "react-icons/fa6";
import { ManageCookiesButton } from "@/components/ManageCookiesButton";

// Business / legal / GO disclosures live on the Contact and About pages
// (and on Privacy). They were previously surfaced here too, but the
// admin asked to keep that information on relevant policy / contact
// surfaces only — so this footer is now purely brand + navigation +
// legal-doc links.

export function Footer() {
  const t = useTranslations("footer");
  return (
    <footer
      className="text-white"
      style={{ backgroundColor: "rgb(53,159,217)" }}
    >
      <div className="container mx-auto py-10">
        {/* Mobile: single stacked column. md+: 12-col grid for tighter
            horizontal use of space. */}
        <div className="grid gap-8 md:grid-cols-12">
          {/* About + disclaimer combined into a single column. The
              disclaimer used to be a fourth column that wasted width
              on tablet; merging keeps it visible without dedicating a
              full grid cell. */}
          <div className="md:col-span-4">
            <div className="flex items-center gap-3 mb-3">
              {/* Korean seal/character mark + the MadenKorea brand mark
                  shown together. Heading text is kept for screen readers
                  and SEO; the brand-mark image is decorative. */}
              <img
                src="/logo-footer.png"
                alt=""
                aria-hidden="true"
                className="h-12 w-12 object-contain flex-shrink-0"
                loading="lazy"
                decoding="async"
              />
              <img
                src="/madenkorea-secondary-logo.png"
                alt=""
                aria-hidden="true"
                className="h-12 w-12 object-contain flex-shrink-0"
                loading="lazy"
                decoding="async"
              />
              <h3 className="text-lg font-semibold">MadenKorea</h3>
            </div>
            <p className="text-sm text-white/90">{t("tagline")}</p>
            <p className="mt-3 text-xs text-white/75 italic">
              {t("resellerDisclaimer")}
            </p>
          </div>

          {/* Links — split into Help + Policies sub-columns inside one
              grid cell so the link list never becomes a 10-tall single
              column. On mobile the two sub-columns become one column
              naturally because the parent grid stacks. */}
          <nav className="md:col-span-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <div>
                <h4 className="text-sm font-semibold mb-2 uppercase tracking-wide">
                  {t("helpHeading")}
                </h4>
                <ul className="space-y-1.5 text-sm">
                  <li>
                    <Link href="/faq" className="text-white/90 hover:text-white">
                      {t("links.faq")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className="text-white/90 hover:text-white">
                      {t("links.contact")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/about" className="text-white/90 hover:text-white">
                      {t("links.about")}
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 uppercase tracking-wide">
                  {t("policiesHeading")}
                </h4>
                <ul className="space-y-1.5 text-sm">
                  <li>
                    <Link
                      href="/policies/shipping-returns"
                      className="text-white/90 hover:text-white"
                    >
                      {t("links.shippingReturns")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/policies/cancellation"
                      className="text-white/90 hover:text-white"
                    >
                      {t("links.cancellation")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/policies/refunds"
                      className="text-white/90 hover:text-white"
                    >
                      {t("links.refunds")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/policies/replacements"
                      className="text-white/90 hover:text-white"
                    >
                      {t("links.replacements")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/privacy" className="text-white/90 hover:text-white">
                      {t("links.privacy")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/terms" className="text-white/90 hover:text-white">
                      {t("links.terms")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/policies/cookies"
                      className="text-white/90 hover:text-white"
                    >
                      {t("links.cookies")}
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-3">
              <ManageCookiesButton
                variant="link"
                label={t("manageCookies")}
                className="text-white/90 hover:text-white p-0 h-auto text-sm"
              />
            </div>
          </nav>

          {/* Connect: row of circular social-icon buttons. Each button
              is a real `<a>` (no Button>Link nesting), with WCAG-compliant
              44px tap targets, a clear hover state, and proper aria-labels.
              Aligned left on mobile, right on desktop so the column lines
              up opposite the About block. The duplicate brand seal that
              used to sit here was removed — the About column already
              shows a logo, no need for two. */}
          <div className="md:col-span-3 flex flex-col items-start md:items-end gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide">
              {t("followUsHeading")}
            </h4>
            <div className="flex flex-wrap gap-2">
              <SocialIconLink
                href="https://www.facebook.com/profile.php?id=61582921345960"
                label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </SocialIconLink>
              <SocialIconLink
                href="https://www.instagram.com/madenkorea_/"
                label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </SocialIconLink>
              <SocialIconLink
                href="https://www.youtube.com/channel/UChrgxiWdyhQpt-RICbWjfbg"
                label="YouTube"
              >
                <Youtube className="h-5 w-5" />
              </SocialIconLink>
              <SocialIconLink
                href="https://www.threads.com/@madenkorea_"
                label="Threads"
              >
                <FaThreads className="h-5 w-5" />
              </SocialIconLink>
            </div>
          </div>
        </div>

        {/* (helper component declared at the bottom of this file) */}

        {/* Bottom strip: copyright + back-pointer to Contact for anything
            customers can't find on the policy pages. */}
        <div className="border-t border-white/20 mt-8 pt-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs text-white/75">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <p>
            {t("needHelpPrefix")}{" "}
            <Link href="/contact" className="underline hover:text-white">
              {t("needHelpLink")}
            </Link>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}

// Circular social-link button. WCAG-compliant 44px touch target on
// mobile (h-11 w-11), 40px on desktop where pointer precision is
// higher. Subtle white-on-translucent fill with a clear hover state.
// Plain <a> avoids the Button > Link nesting that Next/shadcn don't
// like and keeps semantics simple.
function SocialIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="
        inline-flex items-center justify-center
        h-11 w-11 sm:h-10 sm:w-10
        rounded-full
        bg-white/10 hover:bg-white/25
        text-white hover:text-white
        ring-1 ring-white/20 hover:ring-white/40
        transition-colors
      "
    >
      {children}
    </a>
  );
}
