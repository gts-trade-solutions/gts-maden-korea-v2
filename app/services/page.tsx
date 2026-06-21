// app/(marketing)/services/cdsco-regulatory-support/page.tsx
import type { Metadata } from "next";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ShieldCheck,
  ClipboardList,
  FileCheck2,
  Globe,
  Building2,
  SearchCheck,
  FileText,
  HelpCircle,
  CheckCircle2,
  MapPin,
  BadgeCheck,
  Mail, // ✅ added
} from "lucide-react";

export const metadata: Metadata = {
  title: "CDSCO Regulatory Support",
  description:
    "End-to-end CDSCO support for imported cosmetics in India — dossier prep, SUGAM filing, approvals, labeling, and post-approval compliance.",
  alternates: { canonical: "https://madenkorea.com/services" },
  robots: { index: true, follow: true },
};

export default function CdscoRegulatorySupportPage() {
  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold mb-4">CDSCO Regulatory Support</h1>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
            End-to-end assistance for registering imported cosmetics in India — from dossier preparation and SUGAM filing
            to approvals, labeling, and post-approval compliance.
          </p>

          {/* ✅ Email (Hero) */}
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-primary" />
            <a
              href="mailto:info@madenkorea.com"
              className="font-medium underline underline-offset-4 hover:no-underline"
            >
              info@madenkorea.com
            </a>
          </div>
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardContent className="pt-6">
              <ShieldCheck className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Compliance, Simplified</h3>
              <p className="text-muted-foreground">
                We translate complex CDSCO rules into a practical, predictable workflow so you can focus on launch.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <ClipboardList className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Complete Dossier Prep</h3>
              <p className="text-muted-foreground">
                Ingredient review, label vetting, Free Sale Certificates, authorizations, and consolidated documentation.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <FileCheck2 className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">SUGAM Portal Filing</h3>
              <p className="text-muted-foreground">
                Online application submission, fee management, deficiency responses, and certificate retrieval.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <SearchCheck className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Label & Claims Review</h3>
              <p className="text-muted-foreground">
                India-specific labeling, warnings, claims, pack sizes and variants aligned with current norms.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <FileText className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Post-Approval Support</h3>
              <p className="text-muted-foreground">
                Certificate management, renewals, amendments (variants & sites), and audit readiness.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Globe className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">On-Ground Support</h3>
              <p className="text-muted-foreground">
                India team for filings and follow-ups, plus our office in Korea for brand/vendor coordination.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Process */}
        <div className="prose prose-lg max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-6">How We Work (Step-by-Step)</h2>
          <ol className="list-decimal pl-5 space-y-3 text-muted-foreground">
            <li>
              <strong>Product & Site Scoping:</strong> confirm cosmetic category, pack sizes, variants, and manufacturing sites.
            </li>
            <li>
              <strong>Document Collection & Review:</strong> ingredient lists with percentages, manufacturing licenses, Free Sale Certificates,
              labels/artworks, brand authorizations/POA, and product photos.
            </li>
            <li>
              <strong>Label & Claims Validation:</strong> adapt to India requirements; translate where needed and mark mandatory particulars.
            </li>
            <li>
              <strong>Dossier Build & SUGAM Filing:</strong> prepare forms and annexures, submit online, and manage government fee payments.
            </li>
            <li>
              <strong>Queries & Clarifications:</strong> respond to observations/deficiencies until registration is granted.
            </li>
            <li>
              <strong>Post-Approval Support:</strong> certificate management, change control (variants/sites), renewals, and audit readiness.
            </li>
          </ol>

          {/* Documents checklist */}
          <h2 className="text-3xl font-bold mb-6 mt-12">Typical Documents We Handle</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 not-prose">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Core Dossier</CardTitle>
                <CardDescription>Foundation for SUGAM application</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Ingredient/Formula sheet (with % w/w)</li>
                  <li>Manufacturing license & details for each site</li>
                  <li>Free Sale Certificate / Marketing Authorization from country of origin</li>
                  <li>Authorizations: Power of Attorney / Authorization to Indian Representative</li>
                  <li>Packing list of sizes/variants with product photos</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Labels & Compliance</CardTitle>
                <CardDescription>India-specific particulars</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Artwork with mandatory declarations & warnings</li>
                  <li>Importer name & address, MRP format, batch/expiry, net content</li>
                  <li>Claims substantiation (where applicable)</li>
                  <li>Outer/inner label snapshots for each pack size</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* OTHER CERTIFICATIONS — redesigned (no CardHeader) */}
          <h2 className="text-3xl font-bold mb-6 mt-12">Other Certifications</h2>

          <Card className="not-prose overflow-hidden">
            <CardContent className="p-0">
              {/* Gradient ribbon header */}
              <div className="relative border-b bg-gradient-to-r from-primary/15 via-primary/10 to-transparent">
                <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl font-semibold leading-tight">
                      Compliance & Certification Standards
                    </div>
                  </div>

                  {/* Chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    {["Global-ready", "Audit-friendly", "Label-safe"].map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Content grid */}
              <div className="mx-auto max-w-5xl px-6 py-8">
                {/* Intro (rephrased & centered on large screens) */}
                <div className="text-center md:text-left mb-8">
                  <p className="text-muted-foreground max-w-3xl md:max-w-none md:pr-10">
                    Every product we onboard is screened against internationally accepted safety and quality frameworks.
                    Our goal is simple: predictable compliance, transparent documentation, and trust at scale.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Column 1: Commitment */}
                  <div className="rounded-xl border p-5">
                    <h3 className="text-lg font-semibold mb-3">Our Commitment</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        Regulatory-compliant sourcing
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        Ethical & transparent manufacturing
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        Global quality & safety benchmarks
                      </li>
                    </ul>

                    {/* Feature chips */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {["Dermatologically Tested", "Cruelty-Free", "Vegan*"].map((c) => (
                        <span key={c} className="rounded-full bg-muted px-3 py-1 text-xs">
                          {c}
                        </span>
                      ))}
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                      *Where applicable by product/type.
                    </p>
                  </div>

                  {/* Column 2: Cosmetic Compliance */}
                  <div className="rounded-xl border p-5">
                    <h3 className="text-lg font-semibold mb-3">Cosmetic Compliance</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        CDSCO Registration (India)
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        BIS Standards (where applicable)
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        ISO 22716 (Cosmetic GMP)
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        EU CPNP / US FDA guidelines
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        MSDS, COA & full ingredient transparency
                      </li>
                    </ul>
                  </div>

                  {/* Column 3: Food Compliance */}
                  <div className="rounded-xl border p-5">
                    <h3 className="text-lg font-semibold mb-3">Food Compliance</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        FSSAI Central License & Import Clearance (India)
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        HACCP & ISO 22000 food safety standards
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        FDA / EU food safety regulations (as applicable)
                      </li>
                      <li className="flex gap-2">
                        <CheckCircle2 className="h-5 w-5 mt-0.5 text-primary" />
                        Organic, Halal & Kosher certifications (product-specific)
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Korea office */}
          <h2 className="text-3xl font-bold mb-6 mt-12">Our Korea Office</h2>
          <div className="not-prose grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="pt-6">
                <Building2 className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">On-ground Vendor Coordination</h3>
                <p className="text-muted-foreground">
                  Our Korea team works directly with manufacturers for faster document turnaround, artwork updates, and sample management.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <MapPin className="h-12 w-12 text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">Address</h3>
                <p className="text-muted-foreground whitespace-pre-line">
                  Room 1119, 416, Hwagok-ro, Gangseo-gu, Seoul{"\n"}
                  07548, Rep. of Korea
                </p>

                {/* ✅ Email (Korea office card) */}
                <p className="mt-3 text-sm">
                  Email:{" "}
                  <a
                    href="mailto:info@madenkorea.com"
                    className="font-medium underline underline-offset-4 hover:no-underline"
                  >
                    info@madenkorea.com
                  </a>
                </p>
              </CardContent>
            </Card>
          </div>

          {/* FAQs */}
          <h2 className="text-3xl font-bold mb-6 mt-12">Frequently Asked Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 not-prose">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" /> How long does registration usually take?
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                Timelines depend on dossier completeness and query cycles. We front-load checks to keep the process predictable.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" /> Do labels need to be in English?
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                English labeling is common for imports. We guide exact particulars, warnings, and importer information required locally.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" /> Can we add new variants later?
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                Yes—variants/pack sizes and manufacturing site changes can be added through follow-on filings or amendments.
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" /> What if a product is classified as a device?
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-muted-foreground">
                Some beauty tools fall under device rules. We assess the intended use/claims and route them through the correct pathway.
              </CardContent>
            </Card>
          </div>

          {/* Closing */}
          <div className="mt-12 p-6 rounded-lg border not-prose">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-primary mt-1" />
              <div>
                <h3 className="text-2xl font-semibold mb-2">Ready to register your brand for India?</h3>
                <p className="text-muted-foreground">
                  Share your product list and we’ll perform a quick feasibility and document gap-check, then propose the most efficient filing plan.
                </p>

                {/* ✅ Email (Closing CTA) */}
                <p className="mt-3 text-sm">
                  Prefer email?{" "}
                  <a
                    href="mailto:info@madenkorea.com"
                    className="font-medium underline underline-offset-4 hover:no-underline"
                  >
                    info@madenkorea.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
