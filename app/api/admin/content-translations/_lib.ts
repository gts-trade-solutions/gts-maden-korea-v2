// Internal helpers shared by every /api/admin/content-translations/*
// route. Centralises:
//   - admin auth gate (same pattern as the rest of /api/admin)
//   - service-role Supabase client (translations bypass RLS so we
//     can write `source = 'human'` rows even when the editor admin
//     can't grant themselves write privileges via RLS)
//   - per-request Anthropic key loader (server-only)
//
// Underscored filename so Next doesn't treat it as a route segment.

import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { KINDS, type TranslatableKind } from "@/lib/contentTranslator";

export const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

/** Validate that the URL slug maps to a known kind. */
export function asKind(value: unknown): TranslatableKind | null {
  return value === "products" ||
    value === "brands" ||
    value === "categories" ||
    value === "banners"
    ? (value as TranslatableKind)
    : null;
}

/**
 * Auth gate. Returns either the admin Supabase route client (for
 * audit fields) and the user, OR an error response.
 *
 * Mirrors app/api/admin/settings/business-info/route.ts. We accept
 * either a Bearer header (for fetch-from-script use) or cookie auth
 * (for the admin UI).
 */
export async function getAdminOr401() {
  const { getRouteAuth } = await import("@/lib/auth/routeUser");
  const { user, sb } = await getRouteAuth();
  if (!user) {
    return { supabase: sb, user: null, error: json({ ok: false, error: "UNAUTH" }, 401) };
  }
  // Role check via the service-role client (scoped by id) — backend- and
  // RLS-independent, so it behaves identically before/after the auth flip.
  const { data: prof } = await adminSupabase()
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "admin" && prof?.role !== "super_admin") {
    return { supabase: sb, user: null, error: json({ ok: false, error: "FORBIDDEN" }, 403) };
  }
  return { supabase: sb, user, error: null };
}

/**
 * Service-role client. Translation tables have RLS that blocks
 * anon/authed users from writing — the script and admin API must
 * use the service-role key, which is only available server-side.
 */
export function adminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Translation admin client requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function getAnthropicKey(): string {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error("ANTHROPIC_API_KEY missing from server env");
  return k;
}

export { KINDS };
