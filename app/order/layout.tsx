import type { Metadata } from "next";

// /order/success and /order/failure are post-checkout confirmation
// surfaces. Tied to a specific transaction; no public value.
export const metadata: Metadata = {
  title: "Order status",
  robots: { index: false, follow: false, nocache: true },
};

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
