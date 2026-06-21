export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only paginated user list backing /admin/users.
//
// Query params (all optional):
//   q            — case-insensitive match on email / full_name / phone
//   page         — 1-indexed, default 1
//   limit        — default 50, clamped 1..200
//   sort         — newest (default) | oldest | name_asc | name_desc
//                  | email_asc | email_desc | recent_activity
//   joined_from  — ISO yyyy-mm-dd, includes the day
//   joined_to    — ISO yyyy-mm-dd, includes the day (end-of-day inclusive)
//   role         — customer | admin | super_admin
//   verification — verified | unverified | locked
//   country      — ISO-2 country code (matches profiles.preferred_country)
//
// Filtering / sorting implementation:
//   - DB-level: q, joined_from, joined_to, role, country, sort newest/
//     oldest/name_asc/name_desc. Uses Supabase pagination + exact count.
//   - JS-level: verification filter, sort email/recent_activity. When
//     these are active we fetch all matching rows (capped 1000), filter
//     + sort + paginate in JS, and return the post-filter count.
//
// Why JS for verification: the resolved stage depends on
// (grace_start, deadline_override, store_settings.lockout_days). Doing
// it as a single PostgREST filter would need a stored procedure;
// 1000-row in-memory pass is fine at this app's scale (<100 users today).

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const STAFF_ROLES = ["admin", "super_admin", "vendor"];

type SortKey =
  | "newest"
  | "oldest"
  | "name_asc"
  | "name_desc"
  | "email_asc"
  | "email_desc"
  | "recent_activity";

const DB_SORT: Record<string, { column: string; ascending: boolean } | null> = {
  newest: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  name_asc: { column: "full_name", ascending: true },
  name_desc: { column: "full_name", ascending: false },
  email_asc: null,
  email_desc: null,
  recent_activity: null,
};

export async function GET(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
  const limit = Math.min(
    200,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 50))
  );

  const rawSort = (url.searchParams.get("sort") || "newest") as SortKey;
  const sort: SortKey = (
    Object.keys(DB_SORT) as SortKey[]
  ).includes(rawSort)
    ? rawSort
    : "newest";

  const joinedFromRaw = (url.searchParams.get("joined_from") || "").trim();
  const joinedToRaw = (url.searchParams.get("joined_to") || "").trim();
  const roleFilter = (url.searchParams.get("role") || "").trim();
  const verificationFilter = (url.searchParams.get("verification") || "").trim();
  const countryFilter = (url.searchParams.get("country") || "").trim().toUpperCase();

  const sb = admin();

  // Step 0 — store config for lockout-day calculation (needed for
  // verification filter / stage display). Defaults match
  // lib/auth/emailVerification.ts constants so behavior is consistent
  // if the column is missing.
  const { data: settings } = await sb
    .from("store_settings")
    .select("email_verification_lockout_days")
    .eq("id", 1)
    .maybeSingle();
  const lockoutDays =
    Number(settings?.email_verification_lockout_days) > 0
      ? Number(settings!.email_verification_lockout_days)
      : 30;

  // Step 1 — search-term pre-filter (existing behavior, untouched).
  let matchedIds: Set<string> | null = null;
  if (q) {
    const wildcard = `%${q.replace(/[%_]/g, "\\$&")}%`;
    const [{ data: profMatches }, { data: { users: authMatches } = {} as any }] =
      await Promise.all([
        sb
          .from("profiles")
          .select("id")
          .or(`full_name.ilike.${wildcard},phone.ilike.${wildcard}`),
        sb.auth.admin.listUsers({ page: 1, perPage: 200 }).then((r) => ({
          data: {
            users: (r.data?.users ?? []).filter((u) =>
              (u.email || "").toLowerCase().includes(q.toLowerCase())
            ),
          } as any,
        })),
      ]);

    matchedIds = new Set<string>();
    (profMatches ?? []).forEach((r: any) => matchedIds!.add(r.id));
    (authMatches ?? []).forEach((u: any) => matchedIds!.add(u.id));

    if (matchedIds.size === 0) {
      return json({
        ok: true,
        total: 0,
        page,
        limit,
        users: [],
        current_user_id: user!.id,
      });
    }
  }

  // Determine whether we can DB-paginate (fast path) or have to fetch
  // all rows for JS-side filter/sort. JS path triggers when:
  //   - verification filter is set (needs computed stage)
  //   - sort is email_asc / email_desc / recent_activity (needs auth)
  const needsJsPath =
    verificationFilter !== "" ||
    sort === "email_asc" ||
    sort === "email_desc" ||
    sort === "recent_activity";

  // Step 2 — build the profile query with DB-level filters.
  let pq = sb
    .from("profiles")
    .select(
      "id, full_name, phone, preferred_country, role, created_at, updated_at, email_verified_at, email_verification_grace_starts_at, email_verification_deadline_override",
      { count: "exact" }
    );
  if (matchedIds) pq = pq.in("id", Array.from(matchedIds));
  if (joinedFromRaw) pq = pq.gte("created_at", joinedFromRaw);
  if (joinedToRaw) {
    // Inclusive end-of-day: append T23:59:59.999Z so the day is included.
    const endIso = /\d{4}-\d{2}-\d{2}$/.test(joinedToRaw)
      ? `${joinedToRaw}T23:59:59.999Z`
      : joinedToRaw;
    pq = pq.lte("created_at", endIso);
  }
  if (roleFilter && ["customer", "admin", "super_admin"].includes(roleFilter)) {
    pq = pq.eq("role", roleFilter);
  }
  if (countryFilter) {
    pq = pq.eq("preferred_country", countryFilter);
  }

  // Apply DB sort if possible.
  const dbSort = DB_SORT[sort];
  if (dbSort) {
    pq = pq.order(dbSort.column, { ascending: dbSort.ascending, nullsFirst: false });
  } else {
    // JS-sort path; we still want a deterministic primary order so newer
    // signups appear before older within the same JS-sort tie.
    pq = pq.order("created_at", { ascending: false });
  }

  let profs: any[] | null = null;
  let totalAfterDbFilters = 0;

  if (needsJsPath) {
    // Fetch all matching rows (capped) — we'll filter + sort + paginate
    // in JS below.
    const { data, count, error: pErr } = await pq.range(0, 999);
    if (pErr) return json({ ok: false, error: pErr.message }, 500);
    profs = data ?? [];
    totalAfterDbFilters = count ?? profs.length;
  } else {
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, count, error: pErr } = await pq.range(from, to);
    if (pErr) return json({ ok: false, error: pErr.message }, 500);
    profs = data ?? [];
    totalAfterDbFilters = count ?? profs.length;
  }

  // Step 3 — fetch auth.users for the matching ids (parallel
  // getUserById). For the JS-path we may have up to 1000 ids — that's
  // 1000 parallel requests, which is fine for the SDK but heavy on
  // latency. Cap concurrency at 25 to be polite.
  const ids = profs.map((p) => p.id as string);
  const authMap = new Map<string, any>();
  const chunkSize = 25;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((id) => sb.auth.admin.getUserById(id))
    );
    results.forEach((r, j) => {
      if (r.data?.user) authMap.set(chunk[j], r.data.user);
    });
  }

  // Step 4 — assemble merged rows.
  let users = profs.map((p: any) => {
    const au = authMap.get(p.id);
    return {
      id: p.id,
      email: (au?.email as string | null) ?? null,
      full_name: p.full_name ?? null,
      phone: p.phone ?? null,
      preferred_country: p.preferred_country ?? null,
      role: p.role ?? "customer",
      last_sign_in_at: au?.last_sign_in_at ?? null,
      created_at: p.created_at ?? au?.created_at ?? null,
      email_verified_at: p.email_verified_at ?? null,
      email_verification_grace_starts_at:
        p.email_verification_grace_starts_at ?? null,
      email_verification_deadline_override:
        p.email_verification_deadline_override ?? null,
    };
  });

  if (needsJsPath) {
    // Verification filter — compute stage per row.
    if (verificationFilter) {
      const now = Date.now();
      users = users.filter((u) => {
        const isStaff = STAFF_ROLES.includes(u.role);
        const verified = isStaff || !!u.email_verified_at;
        if (verificationFilter === "verified") return verified;

        if (verified) return false;
        // Compute deadline for lockout determination.
        const graceStart = u.email_verification_grace_starts_at
          ? new Date(u.email_verification_grace_starts_at).getTime()
          : null;
        const deadline = u.email_verification_deadline_override
          ? new Date(u.email_verification_deadline_override).getTime()
          : graceStart !== null
            ? graceStart + lockoutDays * 86400000
            : null;
        const lockedOut = deadline !== null && now >= deadline;
        if (verificationFilter === "locked") return lockedOut;
        if (verificationFilter === "unverified") return !lockedOut;
        return true;
      });
    }

    // JS-level sort if needed.
    if (sort === "email_asc" || sort === "email_desc") {
      users.sort((a, b) => {
        const ae = (a.email ?? "").toLowerCase();
        const be = (b.email ?? "").toLowerCase();
        return sort === "email_asc"
          ? ae.localeCompare(be)
          : be.localeCompare(ae);
      });
    } else if (sort === "recent_activity") {
      users.sort((a, b) => {
        const at = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
        const bt = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
        return bt - at;
      });
    }

    // JS-level pagination.
    const total = users.length;
    const startIdx = (page - 1) * limit;
    const sliced = users.slice(startIdx, startIdx + limit);
    return json({
      ok: true,
      total,
      page,
      limit,
      users: sliced,
      current_user_id: user!.id,
    });
  }

  return json({
    ok: true,
    total: totalAfterDbFilters,
    page,
    limit,
    users,
    current_user_id: user!.id,
  });
}
