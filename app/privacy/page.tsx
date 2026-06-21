import { CustomerLayout } from "@/components/CustomerLayout";
import { PolicyHero } from "@/components/PolicyHero";
import {
  PolicyShell,
  PolicyQuickJump,
  PolicySection,
  PolicyDivider,
  PolicyCta,
  PolicyMeta,
  type TocItem,
} from "@/components/PolicyLayout";
import { cookies } from "next/headers";
import { getBusinessInfo } from "@/lib/businessInfo";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Cookie,
  Database,
  FileText,
  Languages,
  Lock,
  RefreshCw,
  Scale,
  Share2,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Policy | MadenKorea",
  description:
    "How MadenKorea collects, uses, shares, and protects your personal data, in line with India's Digital Personal Data Protection Act, 2023.",
  alternates: { canonical: "https://madenkorea.com/privacy" },
  robots: { index: true, follow: true },
};

const TOC: TocItem[] = [
  { id: "who-we-are", label: "Who we are" },
  { id: "what-we-collect", label: "What we collect" },
  { id: "why", label: "Why we use it" },
  { id: "lawful-basis", label: "Lawful basis" },
  { id: "sharing", label: "Sharing" },
  { id: "retention", label: "Retention & deletion" },
  { id: "rights", label: "Your rights" },
  { id: "children", label: "Children" },
  { id: "grievance", label: "Grievance Officer" },
  { id: "security", label: "Security" },
  { id: "cookies", label: "Cookies" },
  { id: "changes", label: "Changes" },
  { id: "languages", label: "Languages" },
];

export default async function PrivacyPage() {
  const business = await getBusinessInfo(cookies().get("mik_country")?.value);

  // Hide rows whose data isn't filled in by the admin yet so the page
  // never shows empty "label: " lines.
  const Row = ({
    label,
    value,
    href,
  }: {
    label: string;
    value: string | null;
    href?: string;
  }) =>
    value ? (
      <li>
        <strong>{label}:</strong>{" "}
        {href ? (
          <a href={href} className="underline">
            {value}
          </a>
        ) : (
          value
        )}
      </li>
    ) : null;

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow="Legal"
        title="Privacy Policy"
        description="How MadenKorea collects, uses, shares, and protects your personal data, in line with India's Digital Personal Data Protection Act, 2023."
      />

      <PolicyShell toc={TOC}>
        <PolicyMeta updated="May 7, 2026" readingTime="8 min read" />
        <PolicyQuickJump items={TOC} />

        <PolicySection id="who-we-are" icon={Building2} title="Who we are">
          <p>
            This Privacy Policy explains how the entity operating
            &ldquo;MadenKorea&rdquo; (the storefront at madenkorea.com)
            processes your personal data. For the purposes of India&apos;s
            Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;),
            we are the <strong>Data Fiduciary</strong> for the data we collect
            from you.
          </p>
          <ul className="not-prose grid gap-2 mt-4 mb-2 text-sm">
            <Row label="Data Fiduciary" value={business.legalEntityName} />
            <Row label="Brand" value="MadenKorea" />
            <Row
              label="Registered office"
              value={business.registeredAddress}
            />
            <Row
              label="Email"
              value={business.supportEmail}
              href={`mailto:${business.supportEmail}`}
            />
            <Row
              label="Phone"
              value={business.publicPhone}
              href={
                business.publicPhone
                  ? `tel:${business.publicPhone.replace(/\s+/g, "")}`
                  : undefined
              }
            />
            <Row label="GSTIN" value={business.gstin} />
          </ul>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="what-we-collect"
          icon={Database}
          title="What data we collect"
        >
          <p>
            We collect data you give us directly (when you create an account,
            place an order, sign up to our newsletter, contact us, or post a
            review) and data your browser sends us automatically when you
            visit the site.
          </p>
          <ul>
            <li><strong>Identity data:</strong> name, date of birth (when provided).</li>
            <li><strong>Contact data:</strong> email address, phone number, shipping and billing addresses.</li>
            <li><strong>Account data:</strong> password (stored hashed), authentication tokens.</li>
            <li><strong>Order data:</strong> products purchased, prices, shipping address, courier tracking numbers.</li>
            <li><strong>Payment data:</strong> we never see or store your card / UPI / netbanking credentials. Razorpay processes these and shares with us only the transaction status, amount, and a payment reference.</li>
            <li><strong>Technical data:</strong> IP address, browser type, device information, approximate location derived from IP.</li>
            <li><strong>Usage data:</strong> pages viewed, products clicked, cart additions, search queries, referral source.</li>
            <li><strong>Marketing preferences:</strong> whether you&apos;ve opted in to email or WhatsApp marketing.</li>
            <li><strong>User-generated content:</strong> product reviews, ratings, photos you upload to reviews.</li>
          </ul>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="why" icon={FileText} title="Why we use your data">
          <ul>
            <li>To process and deliver your orders.</li>
            <li>To manage your account, authenticate you, and provide customer support.</li>
            <li>To send transactional messages about your orders (confirmation, shipping updates, refund notices).</li>
            <li>To send marketing messages, but only with your explicit consent &mdash; you can withdraw it at any time.</li>
            <li>To improve the website, products, and services.</li>
            <li>To detect and prevent fraud and abuse.</li>
            <li>To comply with legal and regulatory obligations (GST records, consumer-protection rules, court orders).</li>
          </ul>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="lawful-basis"
          icon={Scale}
          title="Lawful basis under the DPDP Act"
        >
          <p>We rely on the following grounds set out in the DPDP Act:</p>
          <ul>
            <li><strong>Your consent</strong> for marketing communications, optional analytics cookies, and any other purpose where you actively choose to share data with us.</li>
            <li><strong>Performance of a contract</strong> for everything needed to fulfil your order &mdash; from address details to courier handoff.</li>
            <li><strong>Legal compliance</strong> for tax and consumer-protection records we&apos;re required to keep.</li>
            <li><strong>Legitimate use</strong> for fraud prevention, site security, and core analytics that don&apos;t identify you.</li>
          </ul>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="sharing" icon={Share2} title="Who we share your data with">
          <p>
            We share data with a small number of vetted service providers,
            only to the extent they need it to do their job. We do not sell
            your personal data.
          </p>
          <div className="not-prose overflow-x-auto -mx-1 my-6">
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Processor</th>
                  <th className="px-4 py-2.5 font-medium">Purpose</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr><td className="px-4 py-2.5">Supabase</td><td className="px-4 py-2.5">Database, authentication, file storage</td><td className="px-4 py-2.5">United States</td></tr>
                <tr><td className="px-4 py-2.5">Razorpay</td><td className="px-4 py-2.5">Payment processing, refund handling</td><td className="px-4 py-2.5">India</td></tr>
                <tr><td className="px-4 py-2.5">Amazon SES</td><td className="px-4 py-2.5">Transactional and marketing email delivery</td><td className="px-4 py-2.5">United States</td></tr>
                <tr><td className="px-4 py-2.5">DTDC / Shipsy</td><td className="px-4 py-2.5">Courier and last-mile delivery</td><td className="px-4 py-2.5">India</td></tr>
                <tr><td className="px-4 py-2.5">Meta Platforms</td><td className="px-4 py-2.5">Marketing analytics &amp; ad attribution (only with your consent)</td><td className="px-4 py-2.5">United States / Ireland</td></tr>
                <tr><td className="px-4 py-2.5">Google Analytics</td><td className="px-4 py-2.5">Anonymous usage statistics (only with your consent)</td><td className="px-4 py-2.5">United States</td></tr>
                <tr><td className="px-4 py-2.5">OpenAI</td><td className="px-4 py-2.5">Generation of AI-assisted product / marketing copy</td><td className="px-4 py-2.5">United States</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Some of these processors are located outside India. By using the
            site you understand and accept that your data may be transferred
            to and processed in those jurisdictions, subject to safeguards
            that meet the requirements of the DPDP Act.
          </p>
          <p>
            If your order includes products supplied by a third-party vendor
            through MadenKorea, the vendor receives only the data they need
            to fulfil the order (your name, shipping address, the items in
            that vendor&apos;s portion of your order).
          </p>
          <p>
            We may share data with regulators, courts, or law-enforcement
            agencies when we&apos;re legally required to.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="retention"
          icon={RefreshCw}
          title="How long we keep your data & account deletion"
        >
          <p>
            We retain different categories of data for different lengths of
            time depending on what they&apos;re used for and what the law
            requires:
          </p>
          <ul>
            <li><strong>Order &amp; invoice records:</strong> 7 years, to meet GST and accounting record-keeping rules under Indian tax law. We can&apos;t delete these earlier even if you close your account.</li>
            <li><strong>Account data</strong> (name, email, password hash, saved addresses, wishlist): as long as your account is active, or until you ask us to delete it.</li>
            <li><strong>Marketing data</strong> (newsletter opt-in, WhatsApp consent): until you withdraw consent &mdash; via the unsubscribe link in any marketing email, by replying STOP on WhatsApp, or by editing your preferences in your account.</li>
            <li><strong>Analytics and event logs:</strong> 24 months from the event date, then deleted or aggregated to non-identifiable statistics.</li>
            <li><strong>Customer-support correspondence:</strong> 3 years after the case is closed.</li>
            <li><strong>Fraud-investigation records:</strong> kept as long as needed to investigate and resolve, then deleted.</li>
          </ul>

          <h3>How to delete your account</h3>
          <p>
            You can request deletion of your account at any time. To start the
            process, email{" "}
            <a href={`mailto:${business.supportEmail}`}>
              {business.supportEmail}
            </a>{" "}
            from the address on your account with the subject line{" "}
            <em>&ldquo;Delete my account&rdquo;</em>. We acknowledge the
            request within 48 hours and complete the deletion within 30 days.
          </p>
          <p>
            When we delete an account we remove your profile, saved addresses,
            wishlist, cart, marketing preferences, and any user-generated
            content (reviews, photos) that identifies you. What we keep is
            limited to what we&apos;re legally required to retain &mdash;
            primarily order and invoice records for the 7-year GST window.
          </p>
          <p>
            We may also terminate or suspend an account on our end (with or
            without notice) for fraud, abuse, repeated chargebacks, violation
            of these terms, or any other lawful reason. In that case we follow
            the same deletion rules above, applied as soon as is consistent
            with completing any open investigation.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="rights" icon={UserCircle} title="Your rights">
          <p>
            Under the DPDP Act you have the following rights as a Data
            Principal:
          </p>
          <ul>
            <li><strong>Right to access</strong> a summary of your personal data and the purposes for which we process it.</li>
            <li><strong>Right to correction</strong> of inaccurate or incomplete data, and to update your account details directly from <Link href="/account">My Account</Link>.</li>
            <li><strong>Right to erasure</strong> of your personal data when it&apos;s no longer needed, subject to legal retention rules (e.g. invoices).</li>
            <li><strong>Right to nominate</strong> another individual who can exercise these rights on your behalf in the event of your death or incapacitation.</li>
            <li><strong>Right to grievance redressal</strong> &mdash; raise complaints with our Grievance Officer (next section).</li>
            <li><strong>Right to withdraw consent</strong> at any time. Withdrawing consent doesn&apos;t affect lawfulness of processing carried out before the withdrawal.</li>
          </ul>
          <p>
            To exercise any of these rights, write to{" "}
            <a href={`mailto:${business.supportEmail}`}>
              {business.supportEmail}
            </a>{" "}
            from the email address on your account. We&apos;ll respond within
            30 days.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="children" icon={Users} title="Children's data">
          <p>
            Our products and services are intended for adults (18 years or
            older). The DPDP Act treats anyone under 18 as a child and
            requires verifiable parental consent before processing a
            child&apos;s personal data.
          </p>
          <p>
            We do not knowingly collect personal data from children. If you
            believe a child has shared data with us, please write to{" "}
            <a href={`mailto:${business.supportEmail}`}>
              {business.supportEmail}
            </a>{" "}
            and we&apos;ll delete the relevant records.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="grievance"
          icon={ShieldCheck}
          title="Grievance Redressal Officer"
        >
          <p>
            If you have a concern about how your personal data is being
            handled, contact our Grievance Officer. We acknowledge complaints
            within <strong>48 hours</strong> and aim to resolve them within{" "}
            <strong>one month</strong>, in line with Consumer Protection
            (E-Commerce) Rules 2020 and the DPDP Act.
          </p>
          <ul className="not-prose space-y-2 text-sm">
            <Row label="Name" value={business.grievanceOfficerName} />
            <Row
              label="Designation"
              value={business.grievanceOfficerDesignation}
            />
            <Row
              label="Email"
              value={business.grievanceOfficerEmail}
              href={
                business.grievanceOfficerEmail
                  ? `mailto:${business.grievanceOfficerEmail}`
                  : undefined
              }
            />
            <Row
              label="Phone"
              value={business.publicPhone}
              href={
                business.publicPhone
                  ? `tel:${business.publicPhone.replace(/\s+/g, "")}`
                  : undefined
              }
            />
            <Row label="Address" value={business.registeredAddress} />
          </ul>
          {!business.grievanceOfficerName && (
            <p className="text-sm italic">
              Grievance Officer details are being updated. In the meantime
              please write to{" "}
              <a href={`mailto:${business.supportEmail}`}>
                {business.supportEmail}
              </a>{" "}
              and we&apos;ll route your complaint appropriately.
            </p>
          )}
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="security" icon={Lock} title="Security">
          <p>
            We implement reasonable security practices and procedures
            consistent with the IT (Reasonable Security Practices) Rules,
            2011 and the DPDP Act. These include encryption of data in
            transit (TLS), encryption at rest for sensitive data, role-based
            access for employees, and incident response plans for breaches.
          </p>
          <p>
            Despite our efforts, no system is perfectly secure. If we ever
            detect a personal-data breach that affects you, we&apos;ll notify
            you and the Data Protection Board of India as required by the
            DPDP Act.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="cookies" icon={Cookie} title="Cookies and trackers">
          <p>
            We use cookies and similar browser-storage mechanisms for
            authentication, cart continuity, anonymous analytics, and (with
            your permission) marketing measurement. The full list of cookies,
            their purposes, and how to change your mind any time is on our{" "}
            <Link href="/policies/cookies">Cookie Policy</Link> page.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="changes" icon={FileText} title="Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. When we make
            a material change we&apos;ll update the &ldquo;Last
            updated&rdquo; date and, where required, ask for your fresh
            consent.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="languages" icon={Languages} title="Languages">
          <p>
            This Privacy Policy is published in English. A translation in
            Hindi or another Indian language listed in the Eighth Schedule of
            the Constitution is available on request &mdash; write to{" "}
            <a href={`mailto:${business.supportEmail}`}>
              {business.supportEmail}
            </a>
            .
          </p>
        </PolicySection>

        <PolicyCta supportEmail={business.supportEmail} />
      </PolicyShell>
    </CustomerLayout>
  );
}
