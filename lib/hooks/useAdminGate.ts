"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/**
 * Guard for admin pages that perform Supabase writes.
 *
 * Why this exists: most of the admin tables enforce RLS via `is_admin()`,
 * which returns false for anon. But supabase-js's `update(...).eq(id)`
 * silently affects 0 rows when RLS hides them — the page sees no error
 * and looks like the save succeeded. INSERT into a many-to-many join
 * table, on the other hand, throws a hard "row violates RLS" error.
 * Result: admins whose session lapsed thought their edits were saving
 * (parent rows looked fine) until the join insert blew up.
 *
 * This hook:
 *   - On mount, checks `supabase.auth.getSession()`. If there is no
 *     session at all, redirects to /auth/login and bounces back here
 *     after a successful login.
 *   - Listens to `onAuthStateChange` and redirects on SIGNED_OUT so
 *     a tab that loses its session mid-edit doesn't keep pretending.
 *   - Exposes `requireSession()` for save handlers — returns the fresh
 *     access token, or throws "Your session has expired. Please log in
 *     again." which the caller surfaces via toast/alert.
 *
 * Usage:
 *   const { ready, requireSession } = useAdminGate();
 *   if (!ready) return null;
 *   ...
 *   async function save() {
 *     const token = await requireSession();
 *     await fetch("/api/admin/foo", { headers: { authorization: `Bearer ${token}` }, ... });
 *   }
 */
export function useAdminGate(): {
  ready: boolean;
  requireSession: () => Promise<string>;
} {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const redirected = useRef(false);

  useEffect(() => {
    const redirect = () => {
      if (redirected.current) return;
      redirected.current = true;
      const next = encodeURIComponent(pathname || "/admin");
      router.replace(`/auth/login?redirect=${next}`);
    };

    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data?.session) {
        redirect();
        return;
      }
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) redirect();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router, pathname]);

  async function requireSession(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) {
      throw new Error("Your session has expired. Please log in again.");
    }
    return token;
  }

  return { ready, requireSession };
}
