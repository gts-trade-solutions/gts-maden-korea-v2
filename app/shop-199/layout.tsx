import type { Metadata } from "next";

const CANONICAL = "https://madenkorea.com/shop-199";
const TITLE = "Shop @ ₹199 — Affordable Korean beauty";
const DESCRIPTION =
  "Discover Korean beauty essentials starting at ₹199. Authentic K-beauty skincare and lifestyle picks at entry-level pricing.";

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

export default function Shop199Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
