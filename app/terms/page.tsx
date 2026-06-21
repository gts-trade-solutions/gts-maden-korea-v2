import type { Metadata } from "next";
import Link from "next/link";
import { CustomerLayout } from "@/components/CustomerLayout";
import { PolicyHero } from "@/components/PolicyHero";
import {
  PolicyShell,
  PolicyQuickJump,
  PolicyDivider,
  PolicyCta,
  PolicyMeta,
  type TocItem,
} from "@/components/PolicyLayout";
import { cookies } from "next/headers";
import { getBusinessInfo } from "@/lib/businessInfo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The rules that apply when you browse, buy, or use any service on madenkorea.com.",
  alternates: { canonical: "https://madenkorea.com/terms" },
  robots: { index: true, follow: true },
};

const TOC: TocItem[] = [
  { id: "intro", label: "1. Introduction" },
  { id: "definitions", label: "2. Definitions" },
  { id: "license", label: "3. Use license" },
  { id: "products", label: "4. Product information" },
  { id: "orders", label: "5. Orders & payments" },
  { id: "shipping", label: "6. Shipping & delivery" },
  { id: "returns", label: "7. Cancellations & refunds" },
  { id: "account", label: "8. User account" },
  { id: "termination", label: "8.1. Account termination" },
  { id: "liability", label: "9. Limitation of liability" },
  { id: "force-majeure", label: "10. Force majeure" },
  { id: "law", label: "11. Governing law" },
  { id: "changes", label: "12. Changes to terms" },
  { id: "contact", label: "13. Contact" },
];

// Compact numbered section. Lighter than PolicySection — Terms is
// already long, no need for icons too.
function NumberedSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 mb-10">
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-xs font-mono font-semibold text-primary tracking-wider uppercase">
          §{number}
        </span>
        <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      <div
        className="
          prose prose-neutral max-w-none
          prose-p:text-muted-foreground prose-p:leading-relaxed
          prose-li:text-muted-foreground
          prose-strong:text-foreground
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        "
      >
        {children}
      </div>
    </section>
  );
}

export default async function TermsPage() {
  const business = await getBusinessInfo(cookies().get("mik_country")?.value);
  const jurisdictionLine = business.jurisdictionCity
    ? `the courts in ${business.jurisdictionCity}, India`
    : "the courts at our registered place of business in India";

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow="Legal"
        title="Terms & Conditions"
        description="The rules that apply when you browse, buy, or use any service on madenkorea.com."
      />

      <PolicyShell toc={TOC}>
        <PolicyMeta updated="May 7, 2026" readingTime="6 min read" />
        <PolicyQuickJump items={TOC} />

        <NumberedSection id="intro" number="1" title="Introduction">
          <p>
            Welcome to MadenKorea. These terms and conditions outline the
            rules and regulations for the use of our website and services. By
            accessing this website, we assume you accept these terms and
            conditions. Do not continue to use MadenKorea if you do not agree
            to all of the terms and conditions stated on this page.
          </p>
        </NumberedSection>

        <NumberedSection id="definitions" number="2" title="Definitions">
          <ul>
            <li><strong>Website</strong> refers to MadenKorea, accessible from madenkorea.com</li>
            <li><strong>You</strong> means the individual accessing or using the Service</li>
            <li><strong>Company</strong> refers to MadenKorea</li>
            <li><strong>Service</strong> refers to the Website and all related services</li>
          </ul>
        </NumberedSection>

        <NumberedSection id="license" number="3" title="Use License">
          <p>
            Permission is granted to temporarily access the materials on
            MadenKorea&apos;s website for personal, non-commercial transitory
            viewing only. This is the grant of a license, not a transfer of
            title, and under this license you may not:
          </p>
          <ul>
            <li>Modify or copy the materials</li>
            <li>Use the materials for any commercial purpose or public display</li>
            <li>Attempt to decompile or reverse engineer any software on the website</li>
            <li>Remove any copyright or proprietary notations from the materials</li>
            <li>Transfer the materials to another person or mirror the materials on any other server</li>
          </ul>
        </NumberedSection>

        <NumberedSection id="products" number="4" title="Product Information">
          <p>
            We strive to display our products as accurately as possible.
            However, we do not guarantee that product descriptions, colors, or
            other content on the website is accurate, complete, reliable,
            current, or error-free. Product availability and pricing are
            subject to change without notice.
          </p>
        </NumberedSection>

        <NumberedSection id="orders" number="5" title="Orders and Payments">
          <p>
            By placing an order, you represent that you are legally capable
            of entering into binding contracts. We reserve the right to refuse
            any order placed through the website. All payments must be
            received before we dispatch your order.
          </p>
        </NumberedSection>

        <NumberedSection id="shipping" number="6" title="Shipping and Delivery">
          <p>
            We aim to dispatch orders within 2&ndash;3 business days. Delivery
            times may vary based on your location. Risk of loss and title for
            items purchased pass to you upon delivery to the carrier. We are
            not responsible for delays caused by the shipping carrier or
            customs.
          </p>
        </NumberedSection>

        <NumberedSection
          id="returns"
          number="7"
          title="Cancellations, Returns and Refunds"
        >
          <p>
            Cancellation, return, and refund rules &mdash; including
            timelines, eligibility, and how to start the process &mdash; are
            set out in full on our policy pages. Those pages take precedence
            over any summary in these Terms:
          </p>
          <ul>
            <li>
              <Link href="/policies/cancellation">Cancellation Policy</Link>{" "}
              &mdash; cancelling before or after dispatch, refund timelines.
            </li>
            <li>
              <Link href="/policies/shipping-returns">
                Shipping &amp; Returns
              </Link>{" "}
              &mdash; the 7-day return window, eligibility for damaged or
              defective items, and the hygiene exception for opened skincare.
            </li>
          </ul>
        </NumberedSection>

        <NumberedSection id="account" number="8" title="User Account">
          <p>
            You are responsible for maintaining the confidentiality of your
            account and password. You agree to accept responsibility for all
            activities that occur under your account. We reserve the right to
            refuse service, terminate accounts, or remove content at our sole
            discretion.
          </p>
        </NumberedSection>

        <NumberedSection
          id="termination"
          number="8.1"
          title="Account termination"
        >
          <p>
            You may close your account at any time. To do so, email us from
            the address on your account with the subject line &ldquo;Delete
            my account&rdquo;. We acknowledge within 48 hours and complete the
            deletion within 30 days, subject to the data-retention rules in
            our <Link href="/privacy">Privacy Policy</Link> (notably the
            7-year retention required for GST and accounting records).
          </p>
          <p>
            We may suspend or terminate your account, with or without notice,
            if we have a reasonable belief that you have breached these
            Terms, engaged in fraud or abuse, or been the subject of repeated
            chargebacks. We&apos;ll notify you where we can, unless doing so
            would prejudice an open investigation or violate the law.
          </p>
          <p>
            Termination of your account doesn&apos;t affect rights or
            obligations that have accrued before termination &mdash;
            including any orders that are mid-fulfilment and any outstanding
            payments. Where MadenKorea is at fault, our liability is limited
            per Section 9 below.
          </p>
        </NumberedSection>

        <NumberedSection
          id="liability"
          number="9"
          title="Limitation of Liability"
        >
          <p>
            In no event shall MadenKorea or its suppliers be liable for any
            damages arising out of the use or inability to use the materials
            on the website, even if authorized representatives have been
            notified of the possibility of such damage.
          </p>
        </NumberedSection>

        <NumberedSection
          id="force-majeure"
          number="10"
          title="Force Majeure"
        >
          <p>
            MadenKorea will not be liable for any failure or delay in
            performance of its obligations &mdash; including but not limited
            to dispatching, delivering, or processing returns &mdash; caused
            by events beyond its reasonable control. Such events include but
            are not limited to:
          </p>
          <ul>
            <li>Acts of God, fire, flood, earthquake, or other natural disasters</li>
            <li>War, terrorism, riots, civil unrest, or government action</li>
            <li>Epidemic, pandemic, or other public-health emergencies</li>
            <li>Courier strikes, labour disputes, or transport disruptions</li>
            <li>Power outages, internet or telecom failures, or third-party service outages</li>
            <li>Customs delays or import/export restrictions</li>
          </ul>
          <p>
            During such events we will make reasonable efforts to notify
            affected customers and resume normal operations as soon as
            conditions allow. Refunds for unfulfilled orders during a Force
            Majeure event will be processed per our{" "}
            <Link href="/policies/cancellation">Cancellation Policy</Link>.
          </p>
        </NumberedSection>

        <NumberedSection id="law" number="11" title="Governing Law">
          <p>
            These terms and conditions are governed by and construed in
            accordance with the laws of India. You irrevocably submit to the
            exclusive jurisdiction of {jurisdictionLine} for any dispute
            arising out of or in connection with these terms. Before
            initiating litigation, parties agree to attempt to resolve
            disputes through pre-suit mediation in accordance with the
            Mediation Act, 2023.
          </p>
        </NumberedSection>

        <NumberedSection id="changes" number="12" title="Changes to Terms">
          <p>
            We reserve the right to revise these terms at any time. By using
            this website, you are expected to review these terms regularly to
            ensure you understand all terms and conditions governing the use
            of this website.
          </p>
        </NumberedSection>

        <NumberedSection id="contact" number="13" title="Contact Information">
          <p>
            If you have any questions about these Terms &amp; Conditions,
            please contact us at{" "}
            <a href={`mailto:${business.supportEmail}`}>
              {business.supportEmail}
            </a>{" "}
            or via the <Link href="/contact">contact form</Link>. The full
            business address, phone number, and Grievance Officer details are
            on the <Link href="/contact">Contact page</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </NumberedSection>

        <PolicyCta supportEmail={business.supportEmail} />
      </PolicyShell>
    </CustomerLayout>
  );
}
