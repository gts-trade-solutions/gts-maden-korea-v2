import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CheckCircle, Clock, Package } from "lucide-react";
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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Replacement Policy | MadenKorea",
  description:
    "When MadenKorea will replace a product, how to request a replacement, and what happens if the same item is out of stock.",
  alternates: { canonical: "https://madenkorea.com/policies/replacements" },
  robots: { index: true, follow: true },
};

const TOC: TocItem[] = [
  { id: "when-applicable", label: "When it applies" },
  { id: "how-to-request", label: "How to request" },
  { id: "timeline", label: "Timeline" },
  { id: "out-of-stock", label: "If out of stock" },
];

export default async function ReplacementPolicyPage() {
  const business = await getBusinessInfo(cookies().get("mik_country")?.value);
  const supportEmail = business.supportEmail;

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow="Order policy"
        title="Replacement Policy"
        description="We replace products that arrive damaged, defective, or wrong — same item, no charge. We don't do free exchanges for a different product, size, or shade as cosmetics typically don't have variants."
      />

      <PolicyShell toc={TOC}>
        <PolicyMeta updated="May 7, 2026" readingTime="2 min read" />
        <PolicyQuickJump items={TOC} />

        <PolicySection
          id="when-applicable"
          icon={CheckCircle}
          title="When a replacement applies"
        >
          <p>
            You can ask for a replacement instead of a refund whenever an item
            arrives in any of these states:
          </p>
          <ul>
            <li>
              <strong>Damaged</strong> &mdash; physical damage during transit,
              broken seal, leakage, or a cracked container.
            </li>
            <li>
              <strong>Defective</strong> &mdash; the product itself is faulty
              (broken pump, expired stock, manufacturing defect).
            </li>
            <li>
              <strong>Wrong item</strong> &mdash; you received something
              different from what you ordered.
            </li>
          </ul>
          <p>
            You must raise the request within{" "}
            <strong>7 days of delivery</strong>, matching the return window in
            the{" "}
            <Link href="/policies/shipping-returns#easy-returns">
              Shipping &amp; Returns
            </Link>{" "}
            policy.
          </p>
          <p>
            We don&apos;t support &ldquo;change of mind&rdquo; replacements
            (wrong shade you ordered, didn&apos;t like the texture, etc.) on
            opened cosmetics &mdash; for hygiene reasons. Unopened, sealed
            items can be returned for refund per the Shipping &amp; Returns
            policy.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="how-to-request"
          icon={Package}
          title="How to request a replacement"
        >
          <ol>
            <li>
              Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>{" "}
              within 7 days of delivery. Subject line: &ldquo;Replacement
              request for order #XXXXX&rdquo;.
            </li>
            <li>
              Include 2&ndash;4 photos clearly showing the damage / defect /
              wrong item. For damaged packaging, photos of the outer carton
              help us file a claim with the courier.
            </li>
            <li>
              Tell us whether you&apos;d prefer a <strong>replacement</strong>{" "}
              or a <strong>refund</strong>. We default to whatever you ask
              for.
            </li>
            <li>
              We&apos;ll respond within one business day with a return pickup
              arrangement (if needed) and confirmation of the replacement
              order. The original item must be returned in the condition
              received.
            </li>
          </ol>
          <p>
            You can also raise the request through{" "}
            <Link href="/account">My Account &rarr; Orders</Link> if you
            ordered while signed in. WhatsApp works too &mdash; tap the
            floating icon at the bottom-right of any page.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="timeline" icon={Clock} title="How long it takes">
          <ul>
            <li>
              <strong>Pickup of original item:</strong> 2&ndash;4 business days
              after we confirm the replacement.
            </li>
            <li>
              <strong>Replacement dispatched:</strong> typically within 2
              business days of us receiving the original back.
            </li>
            <li>
              <strong>Replacement delivery:</strong> per the standard delivery
              window for your pincode (visible from the &ldquo;Check
              Delivery&rdquo; box on the product page).
            </li>
          </ul>
          <p>
            Total turnaround end-to-end is usually 7&ndash;14 business days.
            For urgent cases (e.g. you bought it for a specific date) tell us
            in the email and we&apos;ll prioritise.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="out-of-stock"
          icon={AlertCircle}
          title="If the same item is out of stock"
        >
          <p>
            Sometimes we&apos;ve sold the last of a product just before your
            replacement is approved. In that case we&apos;ll offer you two
            options:
          </p>
          <ul>
            <li>
              <strong>Wait for re-stock</strong> &mdash; we&apos;ll hold the
              replacement and ship it as soon as fresh inventory arrives.
              We&apos;ll give you an honest ETA.
            </li>
            <li>
              <strong>Take a refund instead</strong> &mdash; we issue a full
              refund per the{" "}
              <Link href="/policies/refunds">Refund Policy</Link>. No charge,
              no hassle.
            </li>
          </ul>
          <p>
            If a discontinued product can&apos;t be replaced ever, you
            automatically get a refund &mdash; we don&apos;t leave you
            hanging.
          </p>
        </PolicySection>

        <PolicyCta supportEmail={supportEmail} />
      </PolicyShell>
    </CustomerLayout>
  );
}
