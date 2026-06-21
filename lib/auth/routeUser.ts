import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Unified, backend-aware server auth resolver ───────────────────────────
// The single seam every API route should use to answer "who is calling".
//   • Today (AUTH_BACKEND unset): the Supabase session — cookie first, then an
//     `Authorization: Bearer <supabase access_token>` fallback (the pattern the
//     /api/me/* + influencer client calls use).
//   • At the flip (AUTH_BACKEND=nextauth): the NextAuth session instead.
// Funnelling every route through this makes the auth-session flip one config
// change. Vendor routes are excluded (separate app) and keep their own auth.
export type RouteUser = { id: string; email: string | null };

// Full form: returns the user AND a Supabase client suitable for the caller's
// transitional RLS-scoped queries/writes (cookie- or bearer-authenticated).
// This is the drop-in replacement for the per-route `withUser` helpers.
// NOTE: under AUTH_BACKEND=nextauth there is no user-scoped Supabase session —
// `sb` is the anon route client, so any route still doing Supabase RLS ops must
// move those to the admin client / MySQL before the flip (see AUTH_FLIP_PLAN).
export async function getRouteAuth(
  req?: Request
): Promise<{ user: RouteUser | null; sb: SupabaseClient }> {
  const { supabaseRouteClient } = await import("@/lib/supabaseRoute");

  if (process.env.AUTH_BACKEND === "nextauth") {
    const { getSessionUser } = await import("@/lib/auth/session");
    const u = await getSessionUser();
    return {
      user: u ? { id: u.id, email: u.email } : null,
      sb: supabaseRouteClient(),
    };
  }

  // Supabase (transitional) — cookie session first.
  const sb = supabaseRouteClient();
  const { data: cookieUser } = await sb.auth.getUser();
  if (cookieUser.user) {
    return { user: { id: cookieUser.user.id, email: cookieUser.user.email ?? null }, sb };
  }

  // Bearer-token fallback — return the bearer-authenticated client so RLS ops
  // by the caller still resolve to them. Reads the header from the passed
  // request, or from next/headers() for handlers that take no req argument.
  let authHeader = req?.headers?.get?.("authorization") ?? null;
  if (!authHeader) {
    try {
      const { headers } = await import("next/headers");
      authHeader = headers().get("authorization");
    } catch {
      authHeader = null;
    }
  }
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const { createClient } = await import("@supabase/supabase-js");
    const sbBearer = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
    const { data } = await sbBearer.auth.getUser(token);
    if (data.user) {
      return { user: { id: data.user.id, email: data.user.email ?? null }, sb: sbBearer };
    }
  }
  return { user: null, sb };
}

// Convenience form for routes that only need the identity (no DB client).
export async function getRouteUser(req?: Request): Promise<RouteUser | null> {
  return (await getRouteAuth(req)).user;
}

export async function getRouteUserId(req?: Request): Promise<string | null> {
  return (await getRouteAuth(req)).user?.id ?? null;
}
