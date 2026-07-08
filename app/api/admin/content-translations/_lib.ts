// Internal helpers shared by every /api/admin/content-translations/*
// route. Centralises:
//   - admin auth gate (delegates to the shared requireAdmin guard)
//   - per-request Anthropic key loader (server-only)
//
// Data access is MySQL-authoritative: the routes import
// `{ prisma } from "@/lib/db/prisma"` directly and operate on the
// *_translations tables (product/brand/category/banner) plus the base
// entity tables. The translation tables no longer live behind Supabase
// RLS, so there is no service-role client here anymore.
//
// Underscored filename so Next doesn't treat it as a route segment.

import "server-only";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
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
 * Auth gate. Returns either the admin user OR an error response.
 *
 * Delegates to the shared `requireAdmin` guard (identity via the
 * backend-aware seam, role via the service-role profiles read),
 * so admin gating behaves identically before/after the auth flip.
 * No longer returns a Supabase client — data ops go through Prisma.
 */
export async function getAdminOr401(req?: Request) {
  const { user, error } = await requireAdmin(req);
  return { user, error };
}

export function getAnthropicKey(): string {
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error("ANTHROPIC_API_KEY missing from server env");
  return k;
}

export { KINDS };
