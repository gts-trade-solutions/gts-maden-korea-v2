import type { Metadata } from "next";

const CANONICAL = "https://madenkorea.com/bundles";
const TITLE = "K-beauty bundles & gift sets";
const DESCRIPTION =
  "Curated Korean beauty bundles and gift sets. Save on multi-product skincare routines hand-picked by MadenKorea.";

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

export default function BundlesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
