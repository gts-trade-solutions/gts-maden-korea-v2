import type { Metadata } from "next";

const CANONICAL = "https://madenkorea.com/k-plus";
const TITLE = "K Plus Membership — Free shipping & member benefits";
const DESCRIPTION =
  "Join K Plus for free shipping on every order, exclusive member pricing, and early access to new K-beauty drops at MadenKorea.";

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

export default function KPlusLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
