import "server-only";
import { NextResponse } from "next/server";
import { type RouteUser } from "@/lib/auth/routeUser";
import { getSessionUser } from "@/lib/auth/session";

// Shared admin guard — the single gate every admin route uses.
// Identity AND role both come from the NextAuth session: the role is carried in
// the JWT (set at sign-in, see authOptions), so no per-request DB lookup is
// needed. Returns the `{ user, error }` shape the routes expect — `error` is a
// ready-to-return 401/403 response, or null when authorized.
const adminJson = (d: any, s: number) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function requireAdmin(
  _req?: Request
): Promise<{ user: RouteUser | null; error: NextResponse | null }> {
  const u = await getSessionUser();
  if (!u) return { user: null, error: adminJson({ ok: false, error: "UNAUTH" }, 401) };
  const ru: RouteUser = { id: u.id, email: u.email };
  if (u.role !== "admin" && u.role !== "super_admin") {
    return { user: ru, error: adminJson({ ok: false, error: "FORBIDDEN" }, 403) };
  }
  return { user: ru, error: null };
}
