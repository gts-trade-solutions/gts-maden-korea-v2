import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeftRight,
  Clock,
  CreditCard,
  Receipt,
  RefreshCw,
  XCircle,
} from "lucide-react";
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
  title: "Refund Policy | MadenKorea",
  description:
    "When you're entitled to a refund on MadenKorea, how refunds are paid back, how long they take, and what's not refundable.",
  alternates: { canonical: "https://madenkorea.com/policies/refunds" },
  robots: { index: true, follow: true },
};

const TOC: TocItem[] = [
  { id: "when-refundable", label: "When you get a refund" },
  { id: "refund-methods", label: "How we pay it back" },
  { id: "refund-timelines", label: "Timelines" },
  { id: "non-refundable", label: "Not refundable" },
  { id: "promos", label: "Promo orders" },
  { id: "gst", label: "GST & invoices" },
  { id: "disputes", label: "Disputes" },
];

export default async function RefundPolicyPage() {
  const business = await getBusinessInfo(cookies().get("mik_country")?.value);
  const supportEmail = business.supportEmail;

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow="Order policy"
        title="Refund Policy"
        description="Every scenario where money goes back to your account — cancellations, returns, replacements, and edge cases. Detailed timelines and the cancellation/return processes themselves live on their own pages and are linked throughout."
      />

      <PolicyShell toc={TOC}>
        <PolicyMeta updated="May 7, 2026" readingTime="3 min read" />
        <PolicyQuickJump items={TOC} />

        <PolicySection
          id="when-refundable"
          icon={RefreshCw}
          title="When you get a refund"
        >
          <p>You&apos;re entitled to a refund in any of these cases:</p>
          <ul>
            <li>
              <strong>You cancel before dispatch.</strong> Full refund,
              including the shipping fee. See the{" "}
              <Link href="/policies/cancellation">Cancellation Policy</Link>{" "}
              for the exact rules.
            </li>
            <li>
              <strong>You refuse a delivery</strong> at the door. Once the
              courier returns the package to us we issue a full refund.
            </li>
            <li>
              <strong>The product is damaged, defective, or wrong on
              arrival.</strong>{" "}
              Raise a return request within 7 days of delivery per the{" "}
              <Link href="/policies/shipping-returns#easy-returns">
                Shipping &amp; Returns
              </Link>{" "}
              page. We&apos;ll either send a{" "}
              <Link href="/policies/replacements">replacement</Link> or refund
              &mdash; whichever you prefer.
            </li>
            <li>
              <strong>We cancel your order on our end</strong> due to stockout,
              pricing error, fraud check, undeliverable pincode, or other
              reasons listed in the Cancellation Policy. Full refund,
              automatic.
            </li>
            <li>
              <strong>A payment was charged but no order was created.</strong>{" "}
              Rare, but if it happens email us with the transaction reference
              and we&apos;ll refund within 5&ndash;7 business days.
            </li>
          </ul>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="refund-methods"
          icon={CreditCard}
          title="How we pay it back"
        >
          <p>
            Refunds always go back to the <strong>original payment
            method</strong> &mdash; card, UPI, netbanking, or wallet &mdash;
            through our payment partner Razorpay. We don&apos;t offer store
            credit as an alternative.
          </p>
          <p>
            For Cash on Delivery (COD) orders, since nothing was paid up front
            there is usually nothing to refund. The only exception is when a
            COD package is refused at the door and the courier returns it to
            us &mdash; in that case no money has been collected, so no refund
            is needed; the order is simply cancelled.
          </p>
          <p>
            If a return was paid for via COD (i.e. we&apos;re refunding for
            damaged or wrong items received under COD), we&apos;ll issue the
            refund by bank transfer to the account details you provide when
            you raise the return.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="refund-timelines"
          icon={Clock}
          title="Refund timelines"
        >
          <p>
            These are the typical times for the refund to land in your account
            once we&apos;ve confirmed it. Detailed table by payment method is
            on the{" "}
            <Link href="/policies/cancellation#refund-timelines">
              Cancellation Policy
            </Link>{" "}
            page so we maintain a single source of truth.
          </p>
          <ul>
            <li>UPI / Wallets: 1&ndash;2 business days</li>
            <li>Debit / Credit card: 5&ndash;7 business days</li>
            <li>Netbanking: 5&ndash;7 business days</li>
            <li>
              COD (refunded by bank transfer for return cases): 5&ndash;7
              business days after the package returns to us
            </li>
          </ul>
          <p>
            We email you the moment a refund is initiated. If it hasn&apos;t
            shown up 10 business days after that email, write to{" "}
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your
            order number and we&apos;ll trace it with Razorpay.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="non-refundable"
          icon={XCircle}
          title="What is not refundable"
        >
          <ul>
            <li>
              <strong>Opened skincare or personal-care products,</strong> for
              hygiene reasons &mdash; unless they arrived damaged, defective,
              or wrong.
            </li>
            <li>
              <strong>Items returned beyond the 7-day return window</strong>{" "}
              from delivery.
            </li>
            <li>
              <strong>Products that show signs of misuse</strong> or
              aren&apos;t in their original packaging.
            </li>
            <li>
              <strong>Shipping fees</strong> are non-refundable on returns
              initiated by the customer for reasons other than damage / defect
              / wrong item. Shipping fees <em>are</em> refunded for
              pre-dispatch cancellations and for our own cancellations &mdash;
              see the{" "}
              <Link href="/policies/cancellation">Cancellation Policy</Link>.
            </li>
            <li>
              <strong>K Plus membership fees</strong> follow a separate policy
              &mdash; see the <Link href="/k-plus">K Plus terms</Link>.
            </li>
          </ul>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="promos"
          icon={ArrowLeftRight}
          title="Discounted & promo orders"
        >
          <p>
            If you used a discount code, referral link, or influencer promo,
            the refund is calculated on the{" "}
            <strong>actual amount you paid</strong> after the discount, not
            the pre-discount price.
          </p>
          <p>
            For partial returns / cancellations on multi-item orders where a
            cart-level discount was applied, the discount is allocated
            proportionally across the items so the refund matches the value of
            the items you&apos;re returning.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="gst" icon={Receipt} title="GST & invoices">
          <p>
            Every paid order generates a GST-compliant invoice that you can
            download from <Link href="/account">My Account &rarr; Orders</Link>.
            When we refund, we issue a corresponding credit note adjusting the
            GST paid on that order.
          </p>
          {business.gstin && (
            <p>
              Our GSTIN: <strong>{business.gstin}</strong>
            </p>
          )}
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="disputes"
          icon={AlertCircle}
          title="If something is wrong with your refund"
        >
          <p>
            If your refund is the wrong amount, sent to the wrong account, or
            hasn&apos;t arrived 10 business days after our refund-initiated
            email, write to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>{" "}
            with your order number, the original payment reference, and a
            screenshot of the bank/wallet entry (or absence). We&apos;ll trace
            it with Razorpay and resolve within 7 business days.
          </p>
          <p>
            Unresolved complaints can be escalated to our Grievance Officer
            &mdash; the contact details are on the{" "}
            <Link href="/contact">Contact page</Link> and the{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </PolicySection>

        <PolicyCta supportEmail={supportEmail} />
      </PolicyShell>
    </CustomerLayout>
  );
}
