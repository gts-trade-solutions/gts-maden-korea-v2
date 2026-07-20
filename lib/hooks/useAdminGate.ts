"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";

/**
 * Guard for admin pages.
 *
 * Admin identity + role come from the NextAuth session via AuthContext (the
 * role is carried in the JWT, set at sign-in). The hook:
 *   - Waits for the session to resolve, then redirects non-admins to
 *     /auth/login with a `redirect` back to the current page.
 *   - Exposes `requireSession()` for save handlers. The admin API routes these
 *     pages call are gated server-side by the session cookie (requireAdmin), so
 *     no bearer token is needed — it returns an empty string that callers can
 *     keep passing in an Authorization header the guard ignores.
 *
 * Usage:
 *   const { ready, requireSession } = useAdminGate();
 *   if (!ready) return null;
 */
export function useAdminGate(): {
  ready: boolean;
  requireSession: () => Promise<string>;
} {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const redirected = useRef(false);

  const { ready: authReady, isAuthenticated, hasRole } = useAuth();

  useEffect(() => {
    const redirect = () => {
      if (redirected.current) return;
      redirected.current = true;
      const next = encodeURIComponent(pathname || "/admin");
      router.replace(`/auth/login?redirect=${next}`);
    };

    if (!authReady) return; // wait for the session to resolve
    if (!isAuthenticated || !hasRole("admin")) {
      redirect();
      return;
    }
    setReady(true);
  }, [router, pathname, authReady, isAuthenticated, hasRole]);

  async function requireSession(): Promise<string> {
    return "";
  }

  return { ready, requireSession };
}
