import type { Metadata } from "next";
import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CustomerLayout } from "@/components/CustomerLayout";
import { PolicyHero } from "@/components/PolicyHero";
import {
  PolicyCta,
  PolicyMeta,
} from "@/components/PolicyLayout";
import {
  CreditCard,
  Package,
  RotateCcw,
  Truck,
  UserCircle,
} from "lucide-react";
import { cookies } from "next/headers";
import { getShippingConfig } from "@/lib/storeSettings";
import { getBusinessInfo } from "@/lib/businessInfo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FAQ | MadenKorea",
  description:
    "Quick answers to common questions about ordering, shipping, returns, payments, and your MadenKorea account.",
  alternates: { canonical: "https://madenkorea.com/faq" },
  robots: { index: true, follow: true },
};

type Section = {
  id: string;
  label: string;
  Icon: typeof Truck;
  // `a` is the rendered JSX (with links / formatting) shown to users.
  // `aText` is the plain-text answer used for FAQPage JSON-LD — schema
  // accepts plain text or HTML, and plain text is safer than trying to
  // serialise React on a route file (Next blocks `react-dom/server`
  // imports in app/* for client-bundling reasons).
  items: { q: string; a: React.ReactNode; aText: string }[];
};

export default async function FAQPage() {
  const visitorCountry = cookies().get("mik_country")?.value;
  const [shipping, business] = await Promise.all([
    getShippingConfig(),
    getBusinessInfo(visitorCountry),
  ]);
  const thresholdLabel = `₹${shipping.deliveryThreshold.toLocaleString("en-IN")}`;
  const feeLabel = `₹${shipping.defaultShippingFee.toLocaleString("en-IN")}`;
  const supportEmail = business.supportEmail;

  const sections: Section[] = [
    {
      id: "orders-shipping",
      label: "Orders & shipping",
      Icon: Truck,
      items: [
        {
          q: "How long does delivery take?",
          aText:
            "It depends on your pincode. Use the Check Delivery box on any product page to see the exact window: from 1–3 days in Chennai metro up to 10–15 days for the islands. Once dispatched you'll receive a tracking link by email and can track the package any time from My Account → Orders.",
          a: (
            <p>
              It depends on your pincode. Use the &ldquo;Check Delivery&rdquo;
              box on any product page to see the exact window: from 1&ndash;3
              days in Chennai metro up to 10&ndash;15 days for the islands.
              Once dispatched you&apos;ll receive a tracking link by email and
              can track the package any time from{" "}
              <Link href="/account" className="underline">
                My Account &rarr; Orders
              </Link>
              .
            </p>
          ),
        },
        {
          q: "When do I get free shipping?",
          aText: `Pan-India delivery is free on every order above ${thresholdLabel}. Below that, shipping is a flat ${feeLabel}. K Plus members get free shipping on every order, regardless of cart value.`,
          a: (
            <p>
              Pan-India delivery is free on every order above{" "}
              <strong>{thresholdLabel}</strong>. Below that, shipping is a flat{" "}
              <strong>{feeLabel}</strong>.{" "}
              <Link href="/k-plus" className="underline">
                K Plus members
              </Link>{" "}
              get free shipping on every order, regardless of cart value.
            </p>
          ),
        },
        {
          q: "Do you ship across India?",
          aText:
            "Yes — we ship to every Indian pincode covered by our courier partners. The product page's delivery checker tells you the exact ETA for your pincode. If your pincode isn't covered for some reason, the checker says so before you place the order.",
          a: (
            <p>
              Yes &mdash; we ship to every Indian pincode covered by our
              courier partners. The product page&apos;s delivery checker tells
              you the exact ETA for your pincode. If your pincode isn&apos;t
              covered for some reason, the checker says so before you place
              the order.
            </p>
          ),
        },
        {
          q: "Can I change my delivery address after ordering?",
          aText: `Yes, as long as the order hasn't shipped yet. Email ${supportEmail} with your order number and the new address. Once an order is in Shipped status the courier has it and we can no longer redirect.`,
          a: (
            <p>
              Yes, as long as the order hasn&apos;t shipped yet. Email{" "}
              <a href={`mailto:${supportEmail}`} className="underline">
                {supportEmail}
              </a>{" "}
              with your order number and the new address. Once an order is in{" "}
              <em>Shipped</em> status the courier has it and we can no longer
              redirect.
            </p>
          ),
        },
      ],
    },
    {
      id: "returns-refunds",
      label: "Returns & refunds",
      Icon: RotateCcw,
      items: [
        {
          q: "What's your return policy?",
          aText:
            "Raise a return within 7 days of delivery for an item that arrived damaged, defective, or wrong. Opened skincare and personal-care products generally can't be returned for hygiene reasons unless they were faulty on arrival. Full details are on the Shipping & Returns page.",
          a: (
            <p>
              Raise a return within <strong>7 days of delivery</strong> for an
              item that arrived damaged, defective, or wrong. Opened skincare
              and personal-care products generally can&apos;t be returned for
              hygiene reasons unless they were faulty on arrival. Full details
              are on the{" "}
              <Link href="/policies/shipping-returns" className="underline">
                Shipping &amp; Returns
              </Link>{" "}
              page.
            </p>
          ),
        },
        {
          q: "How do I cancel an order?",
          aText: `You can cancel any order for free before it ships — through My Account → Orders, by emailing ${supportEmail} with your order number, or by tapping the WhatsApp icon at the bottom-right of any page. Step-by-step rules and what gets refunded are on the Cancellation Policy page.`,
          a: (
            <p>
              You can cancel any order for free before it ships &mdash; through{" "}
              <Link href="/account" className="underline">
                My Account &rarr; Orders
              </Link>
              , by emailing{" "}
              <a href={`mailto:${supportEmail}`} className="underline">
                {supportEmail}
              </a>{" "}
              with your order number, or by tapping the WhatsApp icon at the
              bottom-right of any page. Step-by-step rules and what gets
              refunded are on the{" "}
              <Link href="/policies/cancellation" className="underline">
                Cancellation Policy
              </Link>{" "}
              page.
            </p>
          ),
        },
        {
          q: "How long does a refund take?",
          aText:
            "Once we confirm the cancellation or receive your return, refunds go back to your original payment method through Razorpay. UPI and wallet refunds typically reach you in 1–2 business days; card and netbanking refunds take 5–7 business days. Detailed table is in the Cancellation Policy.",
          a: (
            <p>
              Once we confirm the cancellation or receive your return, refunds
              go back to your original payment method through Razorpay. UPI
              and wallet refunds typically reach you in 1&ndash;2 business
              days; card and netbanking refunds take 5&ndash;7 business days.
              Detailed table is in the{" "}
              <Link
                href="/policies/cancellation#refund-timelines"
                className="underline"
              >
                Cancellation Policy
              </Link>
              .
            </p>
          ),
        },
        {
          q: "What if my product arrives damaged or wrong?",
          aText: `Email ${supportEmail} within 7 days of delivery with 2–4 photos showing the issue. We'll either send a replacement or refund — your choice. Pickup of the original item is at our cost. See the Replacement Policy for the full process.`,
          a: (
            <p>
              Email{" "}
              <a href={`mailto:${supportEmail}`} className="underline">
                {supportEmail}
              </a>{" "}
              within 7 days of delivery with 2&ndash;4 photos showing the
              issue. We&apos;ll either send a replacement or refund &mdash;
              your choice. Pickup of the original item is at our cost. See
              the{" "}
              <Link href="/policies/replacements" className="underline">
                Replacement Policy
              </Link>{" "}
              for the full process.
            </p>
          ),
        },
      ],
    },
    {
      id: "payments",
      label: "Payments",
      Icon: CreditCard,
      items: [
        {
          q: "What payment methods do you accept?",
          aText:
            "All standard methods through our payment partner Razorpay: UPI, all major credit and debit cards, netbanking, and popular wallets. Cash on Delivery is available for eligible pincodes — the option appears at checkout when applicable.",
          a: (
            <p>
              All standard methods through our payment partner Razorpay: UPI,
              all major credit and debit cards, netbanking, and popular
              wallets. Cash on Delivery is available for eligible pincodes
              &mdash; the option appears at checkout when applicable.
            </p>
          ),
        },
        {
          q: "Are my payment details safe?",
          aText:
            "Yes. Payments are processed by Razorpay over an encrypted PCI-DSS Level 1 compliant connection. We never see or store your card, UPI, or netbanking credentials. More details on the Shipping & Returns page.",
          a: (
            <p>
              Yes. Payments are processed by Razorpay over an encrypted
              PCI-DSS Level 1 compliant connection. We never see or store
              your card, UPI, or netbanking credentials. More details on the{" "}
              <Link
                href="/policies/shipping-returns#secure-payment"
                className="underline"
              >
                Shipping &amp; Returns
              </Link>{" "}
              page.
            </p>
          ),
        },
        {
          q: "My payment failed but money was deducted. What should I do?",
          aText: `Bank holds on failed payments usually release within 3–5 business days automatically. If it doesn't reverse after that, email us at ${supportEmail} with the transaction reference and a screenshot of the bank entry — we'll trace it with Razorpay.`,
          a: (
            <p>
              Bank holds on failed payments usually release within 3&ndash;5
              business days automatically. If it doesn&apos;t reverse after
              that, email us at{" "}
              <a href={`mailto:${supportEmail}`} className="underline">
                {supportEmail}
              </a>{" "}
              with the transaction reference and a screenshot of the bank
              entry &mdash; we&apos;ll trace it with Razorpay.
            </p>
          ),
        },
        {
          q: "Can I get a GST invoice?",
          aText:
            "Yes — every paid order generates a GST-compliant invoice. You can download it from My Account → Orders once it's available. If you need an updated copy or your business name on the invoice, email us before placing the order.",
          a: (
            <p>
              Yes &mdash; every paid order generates a GST-compliant invoice.
              You can download it from{" "}
              <Link href="/account" className="underline">
                My Account &rarr; Orders
              </Link>{" "}
              once it&apos;s available. If you need an updated copy or your
              business name on the invoice, email us before placing the
              order.
            </p>
          ),
        },
      ],
    },
    {
      id: "account",
      label: "Account",
      Icon: UserCircle,
      items: [
        {
          q: "Do I need an account to shop?",
          aText:
            "Yes — you'll be asked to sign in or create an account at checkout. It's free, takes 30 seconds, and lets you track orders, raise returns, save addresses, and access K Plus benefits.",
          a: (
            <p>
              Yes &mdash; you&apos;ll be asked to sign in or create an account
              at checkout. It&apos;s free, takes 30 seconds, and lets you
              track orders, raise returns, save addresses, and access K Plus
              benefits.
            </p>
          ),
        },
        {
          q: "How do I reset my password?",
          aText:
            "On the login page tap Forgot password?. We'll email a reset link to the address on your account — valid for 60 minutes.",
          a: (
            <p>
              On the{" "}
              <Link href="/auth/login" className="underline">
                login page
              </Link>{" "}
              tap &ldquo;Forgot password?&rdquo;. We&apos;ll email a reset
              link to the address on your account &mdash; valid for 60
              minutes.
            </p>
          ),
        },
        {
          q: "How do I delete my account?",
          aText:
            "Email us from the address on your account with the subject Delete my account. We acknowledge within 48 hours and complete the deletion within 30 days. Some records (notably GST-compliant invoices) are retained for the legally required 7 years — full details on the Privacy Policy page.",
          a: (
            <p>
              Email us from the address on your account with the subject{" "}
              <em>&ldquo;Delete my account&rdquo;</em>. We acknowledge within
              48 hours and complete the deletion within 30 days. Some records
              (notably GST-compliant invoices) are retained for the legally
              required 7 years &mdash; full details on the{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>{" "}
              page.
            </p>
          ),
        },
      ],
    },
  ];

  // FAQPage JSON-LD. Lets Google show the question + answer as
  // expandable accordions inside the SERP, and qualifies the page for
  // "People also ask" carousels. Uses the plain-text `aText` field
  // alongside the rendered JSX `a` — Next blocks `react-dom/server` in
  // route files (it can leak into client bundles), so we maintain a
  // text twin instead of stringifying React on the fly.
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: sections.flatMap((section) =>
      section.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.aText,
        },
      }))
    ),
  };

  return (
    <CustomerLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <PolicyHero
        eyebrow="Help center"
        title="Frequently asked questions"
        description="Quick answers to the things customers most often ask. If you don't see your question, email or chat with us at the bottom."
      />

      <div className="container mx-auto py-10 sm:py-14">
        <div className="max-w-4xl mx-auto">
          <PolicyMeta updated="May 7, 2026" />

          {/* Category chips — sticky on desktop. Smooth-scrolls to each
              section. Replaces the previous boxed-grid quick-jump. */}
          <nav
            aria-label="FAQ categories"
            className="sticky top-32 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 mb-8 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b"
          >
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {sections.map(({ id, label, Icon }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="
                      inline-flex items-center gap-1.5 whitespace-nowrap rounded-full
                      border bg-background px-4 py-2 text-sm font-medium
                      text-muted-foreground hover:text-foreground hover:bg-muted
                      transition-colors
                    "
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {sections.map(({ id, label, Icon, items }) => (
            <section key={id} id={id} className="scroll-mt-52 mb-14">
              <div className="flex items-center gap-3 mb-5">
                <div className="rounded-full bg-primary/10 ring-1 ring-primary/20 p-2.5">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                  {label}
                </h2>
              </div>
              <Accordion type="single" collapsible className="w-full">
                {items.map((item, i) => (
                  <AccordionItem key={i} value={`${id}-${i}`}>
                    <AccordionTrigger className="text-left text-base font-medium">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground prose prose-sm max-w-none prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ))}

          <PolicyCta supportEmail={supportEmail} />
        </div>
      </div>
    </CustomerLayout>
  );
}
