import "server-only";

// ── Server auth resolver ──────────────────────────────────────────────────
// The single seam every API route uses to answer "who is calling". Auth is
// NextAuth (JWT) backed by MySQL; the transitional Supabase session/bearer
// paths are gone along with the Supabase backend.
//
// `getRouteAuth` historically also returned a Supabase client (`sb`) for
// RLS-scoped queries. Every route now queries MySQL via Prisma, so the client
// is gone; `sb` remains in the return type as `null` purely so the existing
// `const { user, sb } = await getRouteAuth()` call sites keep compiling.
// Vendor routes are excluded (separate app) and keep their own auth.
export type RouteUser = { id: string; email: string | null };

export async function getRouteAuth(
  _req?: Request
): Promise<{ user: RouteUser | null; sb: null }> {
  const { getSessionUser } = await import("@/lib/auth/session");
  const u = await getSessionUser();
  return {
    user: u ? { id: u.id, email: u.email } : null,
    sb: null,
  };
}

// Convenience form for routes that only need the identity.
export async function getRouteUser(req?: Request): Promise<RouteUser | null> {
  return (await getRouteAuth(req)).user;
}

export async function getRouteUserId(req?: Request): Promise<string | null> {
  return (await getRouteAuth(req)).user?.id ?? null;
}
