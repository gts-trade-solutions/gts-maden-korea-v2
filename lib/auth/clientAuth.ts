"use client";

import { useSession } from "next-auth/react";

// Client auth for components that call /api/* with the user's identity.
// Mirrors the server seam on the client.
//
// Auth travels via the NextAuth session cookie, so callers must keep
// `credentials: "include"` on their fetches. `token` is a truthy SENTINEL when
// signed in purely so existing `if (token)` / `if (!token) return` gates keep
// firing; the sentinel is never read server-side (getRouteAuth reads the
// cookie, never the header), and `authHeaders` is intentionally empty.
const NEXTAUTH_SENTINEL = "nextauth-session";

export type AuthSession = {
  ready: boolean;
  userId: string | null;
  token: string | null;
  authHeaders: Record<string, string>;
};

export function useAuthSession(): AuthSession {
  const { data: naSession, status: naStatus } = useSession();
  const userId = (naSession?.user as any)?.id ?? null;
  return {
    ready: naStatus !== "loading",
    userId,
    token: userId ? NEXTAUTH_SENTINEL : null,
    authHeaders: {},
  };
}

// Async (event-handler) form. Auth is cookie-based, so there is no header to
// add — kept so call sites can keep spreading it into fetch options. Always
// pair with `credentials: "include"`.
export async function clientAuthHeaders(): Promise<Record<string, string>> {
  return {};
}

// Async token for event handlers: a truthy SENTINEL when signed in, else null,
// so existing `if (!token) return` guards keep working.
export async function clientAuthToken(): Promise<string | null> {
  const { getSession } = await import("next-auth/react");
  const s = await getSession();
  return (s?.user as any)?.id ? NEXTAUTH_SENTINEL : null;
}
