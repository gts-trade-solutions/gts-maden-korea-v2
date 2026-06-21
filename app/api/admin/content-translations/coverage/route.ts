// GET /api/admin/content-translations/coverage
//
// Returns translation coverage for every entity kind plus a
// paginated slice of recent activity across all *_translations
// tables.
//
// Response shape:
//   summary:      { products: { sourceRows, translatedRows, fullyCoveredEntities, byLocale: {pl: 30, ...} }, ... }
//   recent:       activity rows for the requested page
//   recentTotal:  total activity rows across all kinds (for pagination math)
//   recentOffset: echoed offset
//   recentLimit:  echoed limit
//
// Query params:
//   recentLimit  — page size, default 20, max 100
//   recentOffset — pagination offset, default 0
//
// Powers the /admin/translations dashboard.

export const dynamic = "force-dynamic";

import {
  adminSupabase,
  getAdminOr401,
  json,
  KINDS,
} from "../_lib";
import { TARGET_LOCALES, type TranslatableKind } from "@/lib/contentTranslator";

const KIND_KEYS: TranslatableKind[] = ["products", "brands", "categories", "banners"];

// Cap how far back pagination can reach. Activity is the union of 4
// tables, and we sort + slice in memory rather than via Postgres
// UNION ALL. This bound keeps the in-memory pool reasonable while
// still letting admins page through 1k+ events if needed.
const MAX_RECENT_POOL = 1000;

export async function GET(req: Request) {
  const { error } = await getAdminOr401();
  if (error) return error;
  const sb = adminSupabase();

  const { searchParams } = new URL(req.url);
  const recentLimit = Math.min(
    Math.max(Number(searchParams.get("recentLimit") ?? 20) || 20, 1),
    100
  );
  const recentOffset = Math.max(
    Number(searchParams.get("recentOffset") ?? 0) || 0,
    0
  );

  const summary: Record<string, any> = {};

  // Pre-compute the active TARGET_LOCALES set so we can drop any
  // stale rows in *_translations whose locale is no longer in the
  // codebase (e.g., a locale was removed from TARGET_LOCALES). This
  // is what kept the dashboard from ever exceeding 100% before — the
  // count is now a tight fraction of (in-scope entities × locales).
  const targetLocaleSet = new Set<string>(TARGET_LOCALES as readonly string[]);

  for (const kind of KIND_KEYS) {
    const cfg = KINDS[kind];

    // 1. In-scope source IDs (e.g., only published products). We need
    //    both the count AND the actual ids so we can restrict the
    //    translation counts below to entities that are still in scope.
    //    Without this, unpublished products that still have
    //    translation rows from earlier inflate translatedRows past
    //    the denominator (sourceRows × locales.length), giving >100%.
    let sourceQ = sb.from(cfg.sourceTable).select("id");
    if (cfg.sourceFilter) {
      for (const [k, v] of Object.entries(cfg.sourceFilter)) {
        sourceQ = sourceQ.eq(k, v as any);
      }
    }
    const { data: sourceIdRows } = (await sourceQ) as {
      data: { id: string }[] | null;
    };
    const sourceIds = (sourceIdRows ?? []).map((r) => r.id);
    const sourceRows = sourceIds.length;
    const sourceIdSet = new Set<string>(sourceIds);

    // 2. Translation rows for this kind. We pull all of them and then
    //    filter in-memory by (locale ∈ TARGET_LOCALES) AND
    //    (entity_id ∈ sourceIdSet) so:
    //      - locale rows for retired languages don't count
    //      - rows for unpublished/deleted entities don't count
    //    Cast on `select()` because template-string interpolation
    //    confuses the Supabase TS parser.
    const { data: trRows } = (await sb
      .from(cfg.translationsTable)
      .select(`${cfg.fkColumn}, locale`)) as { data: any[] | null };

    const byLocale: Record<string, number> = {};
    const perEntity: Record<string, Set<string>> = {};
    let translatedRows = 0;
    for (const row of trRows ?? []) {
      const loc = row.locale as string;
      const eid = (row as any)[cfg.fkColumn] as string;
      if (!targetLocaleSet.has(loc)) continue;
      if (!sourceIdSet.has(eid)) continue;
      translatedRows += 1;
      byLocale[loc] = (byLocale[loc] ?? 0) + 1;
      (perEntity[eid] ??= new Set<string>()).add(loc);
    }

    let fullyCovered = 0;
    const totalLocales = TARGET_LOCALES.length;
    for (const set of Object.values(perEntity)) {
      if (set.size >= totalLocales) fullyCovered += 1;
    }

    summary[kind] = {
      label: cfg.label,
      sourceRows,
      translatedRows,
      fullyCoveredEntities: fullyCovered,
      byLocale,
    };
  }

  // Recent activity — union the four translation tables, sorted by
  // updated_at desc, slice by [offset, offset+limit). Postgres
  // UNION ALL via RPC would be more elegant, but the in-memory
  // merge is simpler and adequate for an admin tool. To support
  // offsets > pageSize, fetch enough rows per table to cover the
  // requested window — capped at MAX_RECENT_POOL to avoid runaway
  // memory if someone tries offset=1e6.
  const perTablePool = Math.min(recentOffset + recentLimit, MAX_RECENT_POOL);

  // We also need the GLOBAL total so the dashboard can compute the
  // last page. count: "exact" is one extra round trip per table but
  // each query is cheap.
  const recent: Array<{
    kind: TranslatableKind;
    entity_id: string;
    locale: string;
    source: string;
    updated_at: string;
  }> = [];
  let recentTotal = 0;
  for (const kind of KIND_KEYS) {
    const cfg = KINDS[kind];
    const { data, count } = (await sb
      .from(cfg.translationsTable)
      .select(`${cfg.fkColumn}, locale, source, updated_at`, { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(perTablePool)) as { data: any[] | null; count: number | null };
    recentTotal += count ?? 0;
    for (const r of data ?? []) {
      recent.push({
        kind,
        entity_id: (r as any)[cfg.fkColumn],
        locale: r.locale,
        source: r.source ?? "ai",
        updated_at: r.updated_at,
      });
    }
  }
  recent.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const recentPage = recent.slice(recentOffset, recentOffset + recentLimit);

  return json({
    ok: true,
    locales: [...TARGET_LOCALES],
    summary,
    recent: recentPage,
    recentTotal,
    recentOffset,
    recentLimit,
  });
}
