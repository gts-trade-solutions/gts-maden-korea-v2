import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Become an influencer",
  description: "Apply to join the MadenKorea influencer programme.",
  robots: { index: false, follow: false, nocache: true },
};

export default function InfluencerRequestLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
