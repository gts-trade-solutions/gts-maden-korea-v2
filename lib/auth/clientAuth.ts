"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { supabase } from "@/lib/supabaseClient";

// Backend-aware client auth for components that call /api/* with the user's
// identity. Mirrors the server seam on the client.
//
//   • Supabase (default): `token` = the Supabase access_token; pass it as a
//     Bearer header exactly as before.
//   • NextAuth (flip): `token` = a truthy SENTINEL when signed in (so existing
//     `if (token)` gates keep firing) — auth actually travels via the NextAuth
//     session cookie, so keep `credentials: "include"` on fetches. The sentinel
//     Bearer is ignored server-side (getRouteAuth's nextauth path reads the
//     cookie, never the header).
//
// Drop-in: components that did `supabase.auth.getSession() -> access_token` swap
// to `const { token, ready } = useAuthSession()` and keep their fetch code.
const NEXTAUTH = process.env.NEXT_PUBLIC_AUTH_BACKEND === "nextauth";
const NEXTAUTH_SENTINEL = "nextauth-session";

export type AuthSession = {
  ready: boolean;
  userId: string | null;
  token: string | null;
  authHeaders: Record<string, string>;
};

export function useAuthSession(): AuthSession {
  const { data: naSession, status: naStatus } = useSession();
  const [sb, setSb] = useState<{ token: string | null; userId: string | null; ready: boolean }>({
    token: null,
    userId: null,
    ready: false,
  });

  useEffect(() => {
    if (NEXTAUTH) return;
    let mounted = true;
    const apply = (session: any) => {
      if (!mounted) return;
      setSb({
        token: session?.access_token ?? null,
        userId: session?.user?.id ?? null,
        ready: true,
      });
    };
    supabase.auth.getSession().then(({ data: { session } }) => apply(session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session));
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (NEXTAUTH) {
    const userId = (naSession?.user as any)?.id ?? null;
    return {
      ready: naStatus !== "loading",
      userId,
      token: userId ? NEXTAUTH_SENTINEL : null,
      authHeaders: {},
    };
  }
  return {
    ready: sb.ready,
    userId: sb.userId,
    token: sb.token,
    authHeaders: sb.token ? { Authorization: `Bearer ${sb.token}` } : {},
  };
}

// Async (event-handler) form. Returns the Authorization header to spread into a
// fetch — Bearer under Supabase, empty under NextAuth (cookie auth). Always pair
// with `credentials: "include"`.
export async function clientAuthHeaders(): Promise<Record<string, string>> {
  if (NEXTAUTH) return {};
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

// Async token, drop-in for `(await supabase.auth.getSession()).data.session.access_token`
// in event handlers: returns the Supabase access_token under Supabase, or a truthy
// SENTINEL under NextAuth when signed in (so existing `if (!token) return` guards and
// `Bearer ${token}` usages keep working — the sentinel header is ignored server-side
// and auth travels via the session cookie; keep `credentials: "include"`).
export async function clientAuthToken(): Promise<string | null> {
  if (NEXTAUTH) {
    const { getSession } = await import("next-auth/react");
    const s = await getSession();
    return (s?.user as any)?.id ? NEXTAUTH_SENTINEL : null;
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}
