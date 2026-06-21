import { CustomerLayout } from "@/components/CustomerLayout";
import { PolicyHero } from "@/components/PolicyHero";
import { PolicyCta } from "@/components/PolicyLayout";
import { Button } from "@/components/ui/button";
import {
  Award,
  Building2,
  Globe,
  Heart,
  Quote,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { getBusinessInfo } from "@/lib/businessInfo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About MadenKorea | MadenKorea",
  description:
    "Learn about MadenKorea—your trusted source for authentic Korean beauty and lifestyle products in India. Premium quality, global reach, customer-first service, and 100% authenticity.",
  alternates: {
    canonical: "https://madenkorea.com/about",
  },
  robots: { index: true, follow: true },
  keywords: [
    "MadenKorea",
    "About us",
    "Korean beauty",
    "K-beauty",
    "authentic products",
    "consumer innovations",
    "India shipping",
  ],
  openGraph: {
    type: "website",
    url: "https://madenkorea.com/about",
    siteName: "MadenKorea",
    title: "About MadenKorea",
    description:
      "Our story, values, and commitment to 100% authentic Korean products.",
    images: [
      {
        url: "/square-logo.png",
        width: 1200,
        height: 630,
        alt: "About MadenKorea",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "About MadenKorea",
    description:
      "Our story, values, and commitment to 100% authentic Korean products.",
    images: ["/square-logo.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  other: {
    "format-detection": "telephone=no, address=no, email=no",
  },
};

type ValueRow = { Icon: typeof Award; titleKey: string; bodyKey: string };

const VALUES: ValueRow[] = [
  { Icon: Award, titleKey: "valuePremiumTitle", bodyKey: "valuePremiumBody" },
  { Icon: Globe, titleKey: "valueReachTitle", bodyKey: "valueReachBody" },
  { Icon: Heart, titleKey: "valueCustomerTitle", bodyKey: "valueCustomerBody" },
  { Icon: ShieldCheck, titleKey: "valueAuthenticTitle", bodyKey: "valueAuthenticBody" },
];

type WhyRow = { titleKey: string; bodyKey: string };
const WHY_ROWS: WhyRow[] = [
  { titleKey: "whyAuthenticityTitle", bodyKey: "whyAuthenticityBody" },
  { titleKey: "whyCurationTitle", bodyKey: "whyCurationBody" },
  { titleKey: "whyPricingTitle", bodyKey: "whyPricingBody" },
  { titleKey: "whyShippingTitle", bodyKey: "whyShippingBody" },
  { titleKey: "whySupportTitle", bodyKey: "whySupportBody" },
];

export default async function AboutPage() {
  const t = await getTranslations("aboutPage");
  const business = await getBusinessInfo(cookies().get("mik_country")?.value);
  const hasCompanyDetails =
    Boolean(business.legalEntityName) ||
    Boolean(business.registeredAddress) ||
    Boolean(business.gstin) ||
    Boolean(business.cdscoRegistration);

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow={t("heroEyebrow")}
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="container mx-auto py-12 sm:py-16">
        {/* ---- Mission pull-quote ---- */}
        <section className="max-w-3xl mx-auto text-center mb-16 sm:mb-20">
          <Quote className="h-10 w-10 text-primary/40 mx-auto mb-4" aria-hidden />
          <p className="text-2xl sm:text-3xl font-medium tracking-tight leading-relaxed">
            {t("pullQuotePart1")} <span className="text-primary">{t("pullQuoteEmphasis")}</span> {t("pullQuotePart2")}
          </p>
        </section>

        {/* ---- Values grid ---- */}
        <section className="max-w-5xl mx-auto mb-16 sm:mb-20">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-2">
              {t("valuesEyebrow")}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {t("valuesTitle")}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {VALUES.map(({ Icon, titleKey, bodyKey }) => (
              <div
                key={titleKey}
                className="rounded-2xl border bg-background p-6 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-full bg-primary/10 ring-1 ring-primary/20 p-2.5">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight">
                    {t(titleKey)}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(bodyKey)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Story ---- */}
        <section className="max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-2">
              {t("storyEyebrow")}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {t("storyTitle")}
            </h2>
          </div>
          <div
            className="
              prose prose-neutral max-w-none
              prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:text-base
              prose-strong:text-foreground
              prose-headings:tracking-tight prose-headings:text-foreground
            "
          >
            <p>{t("storyPara1")}</p>
            <p>{t("storyPara2")}</p>
            <p>{t("storyPara3")}</p>
            <p>{t("storyPara4")}</p>
          </div>
        </section>

        {/* ---- Why choose us list ---- */}
        <section className="max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-2">
              {t("whyEyebrow")}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {t("whyTitle")}
            </h2>
          </div>
          <ul className="space-y-4">
            {WHY_ROWS.map(({ titleKey, bodyKey }) => (
              <li key={titleKey} className="flex gap-4">
                <div className="mt-1 flex-shrink-0 rounded-full bg-primary/10 p-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{t(titleKey)}</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {t(bodyKey)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Company information (statutory) ---- */}
        {hasCompanyDetails && (
          <section className="max-w-4xl mx-auto mt-16 pt-10 border-t">
            <div className="flex items-center gap-3 mb-6">
              <div className="rounded-full bg-primary/10 ring-1 ring-primary/20 p-2.5">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {t("companyHeading")}
              </h2>
            </div>
            <dl className="grid gap-5 sm:grid-cols-2 text-sm">
              {business.legalEntityName && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {t("labelLegalEntity")}
                  </dt>
                  <dd className="font-medium">{business.legalEntityName}</dd>
                </div>
              )}
              {business.registeredAddress && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {t("labelRegisteredOffice")}
                  </dt>
                  <dd className="text-muted-foreground whitespace-pre-line">
                    {business.registeredAddress}
                  </dd>
                </div>
              )}
              {business.gstin && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {t("labelGstin")}
                  </dt>
                  <dd className="font-mono">{business.gstin}</dd>
                </div>
              )}
              {business.cdscoRegistration && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {t("labelCdsco")}
                  </dt>
                  <dd className="font-mono">{business.cdscoRegistration}</dd>
                </div>
              )}
            </dl>
            <p className="mt-6 text-sm text-muted-foreground">
              {t("supportNotePrefix")}{" "}
              <Link href="/contact" className="underline">{t("supportNoteLink")}</Link>
              {t("supportNoteSuffix")}
            </p>
          </section>
        )}

        {/* ---- CTA ---- */}
        <div className="max-w-4xl mx-auto">
          <PolicyCta supportEmail={business.supportEmail} />
        </div>
      </div>
    </CustomerLayout>
  );
}
