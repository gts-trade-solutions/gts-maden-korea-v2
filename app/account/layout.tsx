import type { Metadata } from "next";

// /account, /orders, /orders/[orderId], /orders/[orderId]/invoice,
// /settings, /wishlist — all private to the signed-in user. Noindex for
// the entire segment.
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false, nocache: true },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
