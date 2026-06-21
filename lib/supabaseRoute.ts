// lib/supabaseRoute.ts
import "server-only";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * Route-handler Supabase client.
 *
 * Uses `@supabase/auth-helpers-nextjs` so the cookie format matches what
 * `middleware.ts` refreshes and what `/api/auth/attach` writes after a
 * successful sign-in. Mixing this with `@supabase/ssr`'s
 * `createServerClient` was reading cookies in a different layout, which
 * surfaced as silent 401s on every authenticated API call (most
 * visibly: `Unauthorized` toasts during checkout).
 */
export function supabaseRouteClient() {
  return createRouteHandlerClient({ cookies });
}

/**
 * Identity-bound route client, backend-aware.
 *
 *  - Supabase backend: the cookie-session client above — `auth.uid()` comes
 *    from the refreshed Supabase session cookie (today's behavior).
 *  - NextAuth backend: a client that ACTS AS `userId` via a minted Supabase
 *    user JWT, so `auth.uid()`-based RPCs/RLS (add_to_cart,
 *    create_order_from_cart, address/review policies, …) resolve to the same
 *    user even though there is no Supabase session.
 *
 * Routes that call `auth.uid()` RPCs or hit RLS tables should resolve the user
 * via the seam (getCurrentUserId / getRouteUser) and pass that id here instead
 * of calling `supabaseRouteClient()` directly.
 */
export function supabaseForUser(_userId: string) {
  if (process.env.AUTH_BACKEND === "nextauth") {
    // No Supabase session under NextAuth → use the service-role client (bypasses
    // RLS), scoped by the seam userId in the caller's own queries. `auth.uid()`-
    // based RPCs go through `rpcForUser()` → the `*_as(p_user_id,…)` wrappers.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createServiceClient } = require("@/lib/supabaseServer");
    return createServiceClient();
  }
  return supabaseRouteClient();
}

/**
 * Backend-aware RPC call for `auth.uid()`-based functions.
 *  - NextAuth: calls the `<fn>_as(p_user_id, …)` service-role wrapper, which sets
 *    `auth.uid()` to the seam userId then delegates to the original `<fn>`.
 *  - Supabase: calls the original `<fn>(…)`, with `auth.uid()` from the session.
 * `sb` must come from `supabaseForUser(userId)` so the client matches the backend.
 */
export function rpcForUser(
  sb: any,
  userId: string,
  fn: string,
  args: Record<string, any> = {}
) {
  if (process.env.AUTH_BACKEND === "nextauth") {
    return sb.rpc(`${fn}_as`, { p_user_id: userId, ...args });
  }
  return sb.rpc(fn, args);
}
