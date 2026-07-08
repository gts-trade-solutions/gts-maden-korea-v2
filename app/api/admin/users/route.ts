export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
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
//     oldest/name_asc/name_desc. Uses Prisma pagination + count.
//   - JS-level: verification filter, sort email/recent_activity. When
//     these are active we fetch all matching rows (capped 1000), filter
//     + sort + paginate in JS, and return the post-filter count.
//
// Email lives on the auth user row (auth_users / prisma.user, keyed by the
// same id as profiles). last_sign_in_at is not tracked in MySQL/NextAuth, so
// it is returned as null (recent_activity sort therefore degrades to a stable
// order).

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

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

  // Step 0 — store config for lockout-day calculation (needed for
  // verification filter / stage display). Defaults match
  // lib/auth/emailVerification.ts constants so behavior is consistent
  // if the column is missing.
  const settings = await prisma.store_settings.findUnique({
    where: { id: 1 },
    select: { email_verification_lockout_days: true },
  });
  const lockoutDays =
    Number(settings?.email_verification_lockout_days) > 0
      ? Number(settings!.email_verification_lockout_days)
      : 30;

  // Step 1 — search-term pre-filter. Match full_name / phone on profiles and
  // email on the auth user row (auth_users). MySQL's default CI collation
  // makes `contains` case-insensitive.
  let matchedIds: Set<string> | null = null;
  if (q) {
    const [profMatches, authMatches] = await Promise.all([
      prisma.profiles.findMany({
        where: {
          OR: [{ full_name: { contains: q } }, { phone: { contains: q } }],
        },
        select: { id: true },
      }),
      prisma.user.findMany({
        where: { email: { contains: q } },
        select: { id: true },
      }),
    ]);

    matchedIds = new Set<string>();
    profMatches.forEach((r) => matchedIds!.add(r.id));
    authMatches.forEach((u) => matchedIds!.add(u.id));

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
  const where: Record<string, any> = {};
  if (matchedIds) where.id = { in: Array.from(matchedIds) };
  const createdAt: Record<string, Date> = {};
  if (joinedFromRaw) createdAt.gte = new Date(joinedFromRaw);
  if (joinedToRaw) {
    // Inclusive end-of-day: append T23:59:59.999Z so the day is included.
    const endIso = /\d{4}-\d{2}-\d{2}$/.test(joinedToRaw)
      ? `${joinedToRaw}T23:59:59.999Z`
      : joinedToRaw;
    createdAt.lte = new Date(endIso);
  }
  if (Object.keys(createdAt).length) where.created_at = createdAt;
  if (roleFilter && ["customer", "admin", "super_admin"].includes(roleFilter)) {
    where.role = roleFilter;
  }
  if (countryFilter) {
    where.preferred_country = countryFilter;
  }

  // Apply DB sort if possible; otherwise fall back to a deterministic
  // created_at desc primary order for the JS-sort path.
  const dbSort = DB_SORT[sort];
  const orderBy = dbSort
    ? { [dbSort.column]: dbSort.ascending ? "asc" : "desc" }
    : { created_at: "desc" };

  const selectFields = {
    id: true,
    full_name: true,
    phone: true,
    preferred_country: true,
    role: true,
    created_at: true,
    updated_at: true,
    email_verified_at: true,
    email_verification_grace_starts_at: true,
    email_verification_deadline_override: true,
  } as const;

  let profs: any[] = [];
  let totalAfterDbFilters = 0;

  try {
    if (needsJsPath) {
      // Fetch all matching rows (capped) — we'll filter + sort + paginate
      // in JS below.
      const [rows, count] = await Promise.all([
        prisma.profiles.findMany({
          where,
          select: selectFields,
          orderBy: orderBy as any,
          take: 1000,
        }),
        prisma.profiles.count({ where }),
      ]);
      profs = rows;
      totalAfterDbFilters = count;
    } else {
      const skip = (page - 1) * limit;
      const [rows, count] = await Promise.all([
        prisma.profiles.findMany({
          where,
          select: selectFields,
          orderBy: orderBy as any,
          skip,
          take: limit,
        }),
        prisma.profiles.count({ where }),
      ]);
      profs = rows;
      totalAfterDbFilters = count;
    }
  } catch (pErr: any) {
    return json({ ok: false, error: pErr?.message }, 500);
  }

  // Step 3 — fetch auth user rows (email) for the matching ids. Batched
  // read keyed by the same id as profiles.
  const ids = profs.map((p) => p.id as string);
  const authMap = new Map<string, any>();
  if (ids.length) {
    const authUsers = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, createdAt: true },
    });
    authUsers.forEach((u) => authMap.set(u.id, u));
  }

  // Step 4 — assemble merged rows. last_sign_in_at is unavailable in
  // MySQL/NextAuth and returned as null.
  let users = profs.map((p: any) => {
    const au = authMap.get(p.id);
    return {
      id: p.id,
      email: (au?.email as string | null) ?? null,
      full_name: p.full_name ?? null,
      phone: p.phone ?? null,
      preferred_country: p.preferred_country ?? null,
      role: p.role ?? "customer",
      last_sign_in_at: null,
      created_at: p.created_at ?? au?.createdAt ?? null,
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
    return json(
      jsonSafe({
        ok: true,
        total,
        page,
        limit,
        users: sliced,
        current_user_id: user!.id,
      })
    );
  }

  return json(
    jsonSafe({
      ok: true,
      total: totalAfterDbFilters,
      page,
      limit,
      users,
      current_user_id: user!.id,
    })
  );
}
