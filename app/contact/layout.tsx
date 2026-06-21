import type { Metadata } from "next";

const CANONICAL = "https://madenkorea.com/contact";
const TITLE = "Contact MadenKorea";
const DESCRIPTION =
  "Get in touch with our customer support team. Email or WhatsApp for help with orders, products, or partnerships across India.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
