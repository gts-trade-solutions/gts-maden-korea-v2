import "server-only";
import { NextResponse } from "next/server";
import { getRouteAuth, type RouteUser } from "@/lib/auth/routeUser";

// Shared admin guard — replaces the per-route `getAdminOr401()` copies.
// Identity comes from the backend-aware seam (`getRouteAuth`); the role check
// reads `profiles.role` via the service-role client (scoped by id, RLS- and
// auth-backend-independent), so it behaves identically before and after the
// NextAuth flip. Returns the same `{ user, error }` shape the routes expect:
// `error` is a ready-to-return 401/403 response, or null when authorized.
//
// (Step B will move the role into the NextAuth JWT; until then this read keeps
// admin gating identical to the previous Supabase behavior.)
const adminJson = (d: any, s: number) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function requireAdmin(
  req?: Request
): Promise<{ user: RouteUser | null; error: NextResponse | null }> {
  // NextAuth path (post-flip): identity AND role both come from the session —
  // role is carried in the JWT (set at sign-in, see authOptions), so no
  // per-request DB lookup is needed.
  if (process.env.AUTH_BACKEND === "nextauth") {
    const { getSessionUser } = await import("@/lib/auth/session");
    const u = await getSessionUser();
    if (!u) return { user: null, error: adminJson({ ok: false, error: "UNAUTH" }, 401) };
    const ru: RouteUser = { id: u.id, email: u.email };
    if (u.role !== "admin" && u.role !== "super_admin") {
      return { user: ru, error: adminJson({ ok: false, error: "FORBIDDEN" }, 403) };
    }
    return { user: ru, error: null };
  }

  // Supabase path (today): identity via the seam, role via the service-role
  // client (scoped by id) so gating behaves identically pre-flip.
  const { user } = await getRouteAuth(req);
  if (!user) return { user: null, error: adminJson({ ok: false, error: "UNAUTH" }, 401) };

  const { createAdminClient } = await import("@/lib/supabaseAdmin");
  const { data } = await createAdminClient()
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (data as any)?.role ?? null;
  if (role !== "admin" && role !== "super_admin") {
    return { user, error: adminJson({ ok: false, error: "FORBIDDEN" }, 403) };
  }
  return { user, error: null };
}
