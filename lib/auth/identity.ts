import "server-only";

// ── The auth identity seam ────────────────────────────────────────────────
// Single source of truth for "who is the current user" in server routes.
// Delegates to the unified, backend-aware resolver in `lib/auth/routeUser.ts`
// (Supabase session today, NextAuth at AUTH_BACKEND=nextauth). This no-arg form
// resolves the cookie session; routes that also accept a Bearer token should
// call `getRouteUser(req)` directly so the header fallback applies.
export async function getCurrentUserId(): Promise<string | null> {
  const { getRouteUserId } = await import("@/lib/auth/routeUser");
  return getRouteUserId();
}
