import type { Metadata } from "next";

// Sitewide noindex for the auth segment. /auth/login, /register, /forgot,
// /reset, /callback are all transactional surfaces with no value in
// search results. Pages keep their own per-page <title> via templated
// titles inheriting from the root layout.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
