import type { Metadata } from "next";

const CANONICAL = "https://madenkorea.com/best-seller";
const TITLE = "Best-selling Korean beauty products";
const DESCRIPTION =
  "Shop the top-selling K-beauty products in India. Skincare, makeup, and lifestyle bestsellers loved by MadenKorea customers.";

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

export default function BestSellerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
