import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  CreditCard,
  Lock,
  Package,
  RotateCcw,
  Shield,
  Truck,
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
import { getShippingConfig } from "@/lib/storeSettings";
import { getBusinessInfo } from "@/lib/businessInfo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shipping, Returns & Trust | MadenKorea",
  description:
    "How MadenKorea ships, accepts returns, secures payments, and guarantees authentic Korean products.",
  alternates: { canonical: "https://madenkorea.com/policies/shipping-returns" },
  robots: { index: true, follow: true },
};

const TOC: TocItem[] = [
  { id: "free-shipping", label: "Free shipping" },
  { id: "easy-returns", label: "Easy returns" },
  { id: "secure-payment", label: "Secure payment" },
  { id: "authentic-products", label: "Authentic products" },
];

export default async function ShippingReturnsPage() {
  const visitorCountry = cookies().get("mik_country")?.value;
  const [config, business] = await Promise.all([
    getShippingConfig(),
    getBusinessInfo(visitorCountry),
  ]);
  const thresholdLabel = `₹${config.deliveryThreshold.toLocaleString("en-IN")}`;
  const feeLabel = `₹${config.defaultShippingFee.toLocaleString("en-IN")}`;

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow="Shipping & trust"
        title="Shipping, Returns & Trust"
        description="Everything you need to know about how we ship, how returns work, how your payments stay safe, and why every product on MadenKorea is the real thing."
      />

      <PolicyShell toc={TOC}>
        <PolicyMeta updated="May 7, 2026" readingTime="4 min read" />
        <PolicyQuickJump items={TOC} />

        <PolicySection
          id="free-shipping"
          icon={Truck}
          title="Free Shipping"
        >
          <p>
            We deliver across India. Shipping is{" "}
            <strong>free on every order above {thresholdLabel}</strong>. Orders
            below that ship at a flat <strong>{feeLabel}</strong> per order
            &mdash; the fee shown at checkout is the only one you pay, with no
            hidden surcharges.
          </p>
          <p>
            K Plus members get{" "}
            <strong>free shipping on every order, regardless of cart value</strong>.
            See the <Link href="/k-plus">K Plus benefits</Link> for the full
            list.
          </p>
          <p>
            Estimated delivery times depend on your pincode. Enter yours in the
            &ldquo;Check Delivery&rdquo; box on any product page to see the
            exact window &mdash; from <strong>1&ndash;3 days</strong> in
            Chennai metro up to <strong>10&ndash;15 days</strong> for the
            islands.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="easy-returns" icon={RotateCcw} title="Easy Returns">
          <p>
            You have <strong>7 days from delivery</strong> to raise a return if
            your item arrives damaged, defective, or wrong. We&apos;ll arrange
            a pickup from your registered address and refund you to the
            original payment method once the item is back with us.
          </p>
          <ul>
            <li>
              Items must be unused, in their original packaging, with all
              seals intact.
            </li>
            <li>
              Skincare and personal-care products that have been opened
              cannot be returned for hygiene reasons unless they were damaged
              or defective on arrival.
            </li>
            <li>
              To start a return, head to{" "}
              <Link href="/account">My Account &rarr; Orders</Link> and pick
              the order, or email{" "}
              <a href={`mailto:${business.supportEmail}`}>
                {business.supportEmail}
              </a>
              .
            </li>
            <li>
              To <strong>cancel</strong> an order before it ships (different
              from a return), see the{" "}
              <Link href="/policies/cancellation">Cancellation Policy</Link>.
            </li>
          </ul>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="secure-payment" icon={Shield} title="Secure Payment">
          <p>
            All payments on MadenKorea are processed by{" "}
            <strong>Razorpay</strong>, a PCI-DSS Level 1 certified payment
            gateway. Your card, UPI, netbanking, and wallet details are
            encrypted in transit and never touch our servers.
          </p>

          <div className="not-prose grid gap-3 sm:grid-cols-3 my-6">
            {[
              {
                Icon: Lock,
                title: "256-bit TLS encryption",
                copy: "Every payment request is encrypted end-to-end.",
              },
              {
                Icon: CreditCard,
                title: "Cards, UPI, Netbanking, Wallets",
                copy: "Pay with what works for you.",
              },
              {
                Icon: BadgeCheck,
                title: "No card details stored",
                copy: "We never see or save your payment credentials.",
              },
            ].map(({ Icon, title, copy }) => (
              <div
                key={title}
                className="rounded-xl border bg-background p-4 flex items-start gap-3"
              >
                <Icon className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{copy}</p>
                </div>
              </div>
            ))}
          </div>

          <p>
            <a
              href="https://razorpay.com"
              target="_blank"
              rel="noopener noreferrer"
              className="not-prose inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <Shield className="h-4 w-4" />
              <span>
                Payments secured by{" "}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/razorpay-logo.svg"
                  alt="Razorpay"
                  className="inline-block h-3.5 w-auto align-middle ml-1"
                />
              </span>
            </a>
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="authentic-products"
          icon={Package}
          title="Authentic Products"
        >
          <p>
            Every product on MadenKorea is sourced directly from the brand or
            its authorised distributor in Korea. We do not stock from
            grey-market resellers, and we do not re-pack products before they
            reach you.
          </p>
          <ul>
            <li>Original Korean packaging and barcodes on every unit.</li>
            <li>
              Manufacturing and expiry dates are checked at intake; near-expiry
              stock is never shipped.
            </li>
            <li>
              If you ever suspect a product isn&apos;t authentic, email us at{" "}
              <a href={`mailto:${business.supportEmail}`}>
                {business.supportEmail}
              </a>{" "}
              and we&apos;ll investigate and replace or refund &mdash; no
              questions asked.
            </li>
          </ul>

          <div className="not-prose mt-6 rounded-2xl border-2 border-primary/40 bg-primary/5 p-6 sm:p-7 space-y-3">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">
                MadenKorea Authenticity Guarantee
              </h3>
            </div>
            <p className="text-sm">
              If a product purchased from MadenKorea is found to be{" "}
              <strong>counterfeit, tampered with, or expired on arrival</strong>,
              we commit to the following remedy at our cost, regardless of the
              standard 7-day return window:
            </p>
            <ul className="list-disc pl-6 text-sm space-y-1">
              <li>
                <strong>Full refund</strong> of the price paid, processed to
                your original payment method per our{" "}
                <Link href="/policies/refunds" className="underline">
                  Refund Policy
                </Link>
                .
              </li>
              <li>
                <strong>Return shipping reimbursed</strong> &mdash;
                we&apos;ll arrange a courier pickup or refund the courier
                charges if you ship it yourself.
              </li>
              <li>
                <strong>Replacement at our cost</strong> if you&apos;d prefer
                a genuine unit instead of a refund, subject to stock
                availability per our{" "}
                <Link href="/policies/replacements" className="underline">
                  Replacement Policy
                </Link>
                .
              </li>
              <li>
                We may request photos of the product, the packaging, the
                barcodes, and the invoice to verify the claim. We cooperate
                fully with brand/distributor investigations where applicable.
              </li>
            </ul>
            <p className="text-sm">
              <strong>How to file a claim.</strong> Email{" "}
              <a
                href={`mailto:${business.supportEmail}`}
                className="underline"
              >
                {business.supportEmail}
              </a>{" "}
              with your order number and supporting photos. We acknowledge
              within 48 hours and resolve within 14 business days.
            </p>
            {business.grievanceOfficerName && (
              <p className="text-sm">
                <strong>If unresolved,</strong> escalate to our Grievance
                Officer{" "}
                <span className="font-medium">
                  {business.grievanceOfficerName}
                </span>
                {business.grievanceOfficerEmail && (
                  <>
                    {" at "}
                    <a
                      href={`mailto:${business.grievanceOfficerEmail}`}
                      className="underline"
                    >
                      {business.grievanceOfficerEmail}
                    </a>
                  </>
                )}
                . The Grievance Officer is the named arbiter for authenticity
                disputes and will issue a written decision within one month.
              </p>
            )}
          </div>
        </PolicySection>

        <PolicyCta supportEmail={business.supportEmail} />
      </PolicyShell>
    </CustomerLayout>
  );
}
