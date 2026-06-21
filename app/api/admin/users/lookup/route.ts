export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Bulk admin lookup: given a set of user ids, return their auth-side
// metadata (email, last_sign_in_at) merged with the profile fields
// (full_name, phone, role). Used by admin pages that already have a
// list of user_ids (influencer requests, payouts, etc.) and need to
// show the email/name without round-tripping through the full paged
// /api/admin/users listing.
//
// Query: ?ids=<comma-separated uuids>   (max 100)
// Response:
//   { ok: true, users: { [id]: { email, full_name, phone, role,
//     last_sign_in_at, created_at } } }

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

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

  const sb = admin();

  // Pull profile fields + auth metadata in parallel. The auth lookups
  // run per-id because the JS SDK doesn't support a batch get; they're
  // cheap and capped at 100, so this stays well under the route's
  // budget.
  const [{ data: profs }, authResults] = await Promise.all([
    sb
      .from("profiles")
      .select("id, full_name, phone, role, created_at")
      .in("id", ids),
    Promise.all(ids.map((id) => sb.auth.admin.getUserById(id))),
  ]);

  const profMap = new Map<string, any>();
  (profs ?? []).forEach((p: any) => profMap.set(p.id, p));

  const out: Record<string, any> = {};
  authResults.forEach((r, i) => {
    const id = ids[i];
    const au = r.data?.user ?? null;
    const p = profMap.get(id) ?? null;
    out[id] = {
      email: au?.email ?? null,
      full_name: p?.full_name ?? au?.user_metadata?.full_name ?? null,
      phone: p?.phone ?? null,
      role: p?.role ?? "customer",
      last_sign_in_at: au?.last_sign_in_at ?? null,
      created_at: p?.created_at ?? au?.created_at ?? null,
    };
  });

  return json({ ok: true, users: out });
}
