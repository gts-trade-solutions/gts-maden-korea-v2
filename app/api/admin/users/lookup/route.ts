export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Bulk admin lookup: given a set of user ids, return their auth-side
// metadata (email) merged with the profile fields (full_name, phone,
// role). Used by admin pages that already have a list of user_ids
// (influencer requests, payouts, etc.) and need to show the email/name
// without round-tripping through the full paged /api/admin/users listing.
//
// Query: ?ids=<comma-separated uuids>   (max 100)
// Response:
//   { ok: true, users: { [id]: { email, full_name, phone, role,
//     last_sign_in_at, created_at } } }
//
// Email lives on the auth user row (auth_users / prisma.user, keyed by the
// same id as profiles). last_sign_in_at is not tracked in MySQL/NextAuth, so
// it is returned as null to preserve the response shape.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const { error: authErr } = await requireAdmin(req);
  if (authErr) return authErr;

  const url = new URL(req.url);
  const raw = (url.searchParams.get("ids") || "").trim();
  if (!raw) return json({ ok: true, users: {} });

  const ids = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s))
    )
  ).slice(0, 100);

  if (ids.length === 0) return json({ ok: true, users: {} });

  // Pull profile fields + auth metadata in parallel — two batched reads
  // instead of per-id lookups.
  const [profs, authUsers] = await Promise.all([
    prisma.profiles.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true, phone: true, role: true, created_at: true },
    }),
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, name: true, createdAt: true },
    }),
  ]);

  const profMap = new Map<string, any>();
  profs.forEach((p) => profMap.set(p.id, p));
  const authMap = new Map<string, any>();
  authUsers.forEach((u) => authMap.set(u.id, u));

  const out: Record<string, any> = {};
  ids.forEach((id) => {
    const au = authMap.get(id) ?? null;
    const p = profMap.get(id) ?? null;
    out[id] = {
      email: au?.email ?? null,
      full_name: p?.full_name ?? au?.name ?? null,
      phone: p?.phone ?? null,
      role: p?.role ?? "customer",
      last_sign_in_at: null,
      created_at: p?.created_at ?? au?.createdAt ?? null,
    };
  });

  return json(jsonSafe({ ok: true, users: out }));
}
