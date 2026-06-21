import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertCircle,
  Clock,
  CreditCard,
  Mail,
  Package,
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
import { getShippingConfig } from "@/lib/storeSettings";
import { getBusinessInfo } from "@/lib/businessInfo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cancellation Policy | MadenKorea",
  description:
    "How and when you can cancel an order on MadenKorea, what gets refunded, and how long refunds take to reach your account.",
  alternates: { canonical: "https://madenkorea.com/policies/cancellation" },
  robots: { index: true, follow: true },
};

const TOC: TocItem[] = [
  { id: "before-dispatch", label: "Before dispatch" },
  { id: "after-dispatch", label: "After dispatch" },
  { id: "how-to-cancel", label: "How to cancel" },
  { id: "refund-timelines", label: "Refund timelines" },
  { id: "edge-cases", label: "Edge cases" },
  { id: "we-cancel", label: "When we may cancel" },
];

export default async function CancellationPolicyPage() {
  const visitorCountry = cookies().get("mik_country")?.value;
  const [config, business] = await Promise.all([
    getShippingConfig(),
    getBusinessInfo(visitorCountry),
  ]);
  const thresholdLabel = `₹${config.deliveryThreshold.toLocaleString("en-IN")}`;

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow="Order policy"
        title="Cancellation Policy"
        description="How to cancel an order, when you can do it for free, and how long refunds take to land back in your account."
      />

      <PolicyShell toc={TOC}>
        <PolicyMeta updated="May 7, 2026" readingTime="3 min read" />
        <PolicyQuickJump items={TOC} />

        <PolicySection
          id="before-dispatch"
          icon={XCircle}
          title="Cancelling before dispatch"
        >
          <p>
            You can cancel any order for <strong>free</strong> at any time
            before we hand it over to the courier. We&apos;ll refund the entire
            order &mdash; including any shipping fee &mdash; to your original
            payment method.
          </p>
          <p>
            An order is considered <strong>not yet dispatched</strong> as long
            as the status in{" "}
            <Link href="/account">My Account &rarr; Orders</Link> reads{" "}
            <em>Processing</em>. Once it changes to <em>Shipped</em>, the
            package is with the courier and the rules in the next section
            apply.
          </p>
          <p>
            Cash on Delivery (COD) orders follow the same rule: cancel any time
            before dispatch, no charge, no refund needed since nothing has been
            paid yet.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="after-dispatch"
          icon={Package}
          title="Cancelling after dispatch"
        >
          <p>
            Once an order is in transit we can no longer recall it from the
            courier. You have two options:
          </p>
          <ul>
            <li>
              <strong>Refuse delivery</strong> when the courier arrives. The
              package returns to us and we refund the full order.
            </li>
            <li>
              <strong>Accept delivery</strong> and raise a return request within
              7 days, subject to the eligibility rules on our{" "}
              <Link href="/policies/shipping-returns#easy-returns">
                Shipping &amp; Returns
              </Link>{" "}
              page (damaged, defective, or wrong items qualify; opened skincare
              and personal-care products generally do not, for hygiene
              reasons).
            </li>
          </ul>
          <p>
            COD packages refused at the door are automatically cancelled on our
            side once the courier returns the parcel to us.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="how-to-cancel" icon={Mail} title="How to cancel">
          <p>Three ways to reach us; pick whichever is easiest for you:</p>
          <ol>
            <li>
              <strong>Through your account.</strong> Go to{" "}
              <Link href="/account">My Account &rarr; Orders</Link>, open the
              order, and request cancellation. Available while the order is in{" "}
              <em>Processing</em>.
            </li>
            <li>
              <strong>By email.</strong> Write to{" "}
              <a href={`mailto:${business.supportEmail}`}>
                {business.supportEmail}
              </a>{" "}
              with your order number. Subject line: &ldquo;Cancel order
              #XXXXX&rdquo;. If the order hasn&apos;t shipped yet we&apos;ll
              process the cancellation the same business day.
            </li>
            <li>
              <strong>By WhatsApp.</strong> Tap the floating WhatsApp icon at
              the bottom-right of any page and send us your order number with a
              cancellation note.
            </li>
          </ol>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="refund-timelines"
          icon={Clock}
          title="Refund timelines"
        >
          <p>
            Refunds go back to your original payment method through our payment
            partner Razorpay. We confirm the refund by email when it&apos;s
            initiated.
          </p>

          <div className="not-prose overflow-x-auto -mx-1 my-6">
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Payment method</th>
                  <th className="px-4 py-2.5 font-medium">
                    After cancellation is confirmed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="px-4 py-2.5">UPI / Wallets</td>
                  <td className="px-4 py-2.5">1&ndash;2 business days</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">Debit / Credit card</td>
                  <td className="px-4 py-2.5">5&ndash;7 business days</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">Netbanking</td>
                  <td className="px-4 py-2.5">5&ndash;7 business days</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5">COD (refused on delivery)</td>
                  <td className="px-4 py-2.5">
                    Bank transfer, 5&ndash;7 business days after package returns
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            If the refund hasn&apos;t shown up 10 business days after our
            confirmation, please email us with your order number and we&apos;ll
            trace it with Razorpay.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection id="edge-cases" icon={RefreshCw} title="Edge cases">
          <h3>Partial cancellations</h3>
          <p>
            If your order has more than one item, you can cancel individual
            items before dispatch. We refund the cancelled items&apos; price;
            shipping treatment depends on whether the remaining cart still
            qualifies for free shipping (currently {thresholdLabel} and above)
            &mdash; if it doesn&apos;t, the standard shipping fee applies to
            the items that still ship.
          </p>

          <h3>Bundles</h3>
          <p>
            Bundles are sold as a single unit; you can cancel the bundle but
            not a single item inside it, since the bundle&apos;s price reflects
            the discounted package.
          </p>

          <h3>Discounted / promo orders</h3>
          <p>
            If you used a discount code or referral link, the refund is
            calculated on the actual amount you paid after the discount, not
            the original price.
          </p>

          <h3>Failed or abandoned orders</h3>
          <p>
            If a payment fails at checkout, no order is created &mdash;
            there&apos;s nothing for us to cancel. Any temporary hold your bank
            places usually releases within 3&ndash;5 business days. Email us if
            it doesn&apos;t.
          </p>

          <h3>K Plus membership</h3>
          <p>
            K Plus is a paid membership and follows its own cancellation rules
            &mdash; see the <Link href="/k-plus">K Plus terms</Link> page for
            details.
          </p>

          <h3>Vendor / marketplace items</h3>
          <p>
            If your order includes products supplied by a third-party vendor
            through MadenKorea, cancellation is coordinated by our team but
            processed in conjunction with the vendor. The same timelines above
            apply.
          </p>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          id="we-cancel"
          icon={AlertCircle}
          title="When we may cancel an order"
        >
          <p>
            In rare cases we may have to cancel an order on our end. If we do,
            you&apos;ll get a notification by email and a full refund within
            the timelines above. Reasons include:
          </p>
          <ul>
            <li>The product is unexpectedly out of stock or discontinued.</li>
            <li>We detect fraudulent payment activity.</li>
            <li>A pricing or inventory error on our side.</li>
            <li>Your delivery address is outside the area we can ship to.</li>
            <li>
              We&apos;re unable to reach you on the contact details you
              provided.
            </li>
          </ul>
        </PolicySection>

        <PolicyDivider />

        <PolicySection
          icon={CreditCard}
          title="Payments are secure throughout"
        >
          <p>
            All payments and refunds run through Razorpay over an encrypted,
            PCI-DSS compliant connection. We never see or store your card
            details. Read more on the{" "}
            <Link href="/policies/shipping-returns#secure-payment">
              Shipping &amp; Returns
            </Link>{" "}
            page.
          </p>
        </PolicySection>

        <PolicyCta supportEmail={business.supportEmail} />
      </PolicyShell>
    </CustomerLayout>
  );
}
