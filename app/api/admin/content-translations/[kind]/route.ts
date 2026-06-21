// GET /api/admin/content-translations/:kind
//
// Returns the list of in-scope entities for `kind` with per-row
// translation status (which locales are present, which are
// human-edited). Used by the dashboard listing pages.
//
// Query params:
//   q       — case-insensitive substring filter on the entity's
//             display name. Optional.
//   limit   — page size, default 50, max 200.
//   offset  — pagination offset, default 0.

export const dynamic = "force-dynamic";

import {
  asKind,
  adminSupabase,
  getAdminOr401,
  json,
  KINDS,
} from "../_lib";
import {
  TARGET_LOCALES,
  namespaceHash,
  pickTranslatablePayload,
} from "@/lib/contentTranslator";

type RouteParams = { params: { kind: string } };

export async function GET(req: Request, { params }: RouteParams) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const kind = asKind(params.kind);
  if (!kind) return json({ ok: false, error: "BAD_KIND" }, 400);
  const cfg = KINDS[kind];

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);

  const sb = adminSupabase();

  // Pick the canonical display column. Brand/product/category have
  // `name`; banners use `alt` since title is optional.
  const displayCol = kind === "banners" ? "alt" : "name";

  // Stale filter — when ?stale=1 is set, the response only includes
  // entities with at least one stale translation. Applied client-side
  // since the staleness predicate spans source-hash computation and a
  // row-by-row comparison against the translations table.
  const staleOnly = searchParams.get("stale") === "1";

  // Select the display column + every translatable field so we can
  // compute the current source hash here and surface staleness per
  // entity. Translatable fields are usually under 5KB total per row
  // (product descriptions are the longest), so reading them at list
  // time is cheap at page sizes of 25–50.
  const selectCols = ["id", "slug", displayCol, ...cfg.translatableFields]
    .filter((c, i, arr) => arr.indexOf(c) === i) // dedupe in case displayCol overlaps
    .join(", ");

  let sourceQ = sb
    .from(cfg.sourceTable)
    .select(selectCols, { count: "exact" });

  if (cfg.sourceFilter) {
    for (const [k, v] of Object.entries(cfg.sourceFilter)) {
      sourceQ = sourceQ.eq(k, v as any);
    }
  }
  if (q) sourceQ = sourceQ.ilike(displayCol, `%${q}%`);
  sourceQ = sourceQ.order(displayCol, { ascending: true }).range(offset, offset + limit - 1);

  const { data: rows, count, error: srcErr } = await sourceQ;
  if (srcErr) return json({ ok: false, error: srcErr.message }, 500);

  const ids = (rows ?? []).map((r: any) => r.id);
  if (ids.length === 0) {
    return json({
      ok: true,
      total: count ?? 0,
      locales: [...TARGET_LOCALES],
      items: [],
    });
  }

  // Fetch all (entity_id, locale, source, source_hash) tuples for
  // these rows in one query so we can compute per-locale status +
  // staleness without N round trips. Cast — see coverage route
  // comment for why TS chokes here.
  const { data: trRows, error: trErr } = (await sb
    .from(cfg.translationsTable)
    .select(`${cfg.fkColumn}, locale, source, source_hash, updated_at`)
    .in(cfg.fkColumn, ids)) as { data: any[] | null; error: any };
  if (trErr) return json({ ok: false, error: trErr.message }, 500);

  // Compute current source hashes once per entity. We need these to
  // mark rows stale where the stored source_hash no longer matches
  // the canonical English content.
  const currentHashByEntity = new Map<string, string>();
  for (const r of (rows ?? []) as any[]) {
    currentHashByEntity.set(
      r.id as string,
      namespaceHash(pickTranslatablePayload(kind, r as Record<string, any>))
    );
  }

  type LocaleStatus = {
    source: string;
    updated_at: string;
    stale: boolean;
  };
  const statusByEntity: Record<string, Record<string, LocaleStatus>> = {};
  for (const r of trRows ?? []) {
    const eid = (r as any)[cfg.fkColumn] as string;
    const currentHash = currentHashByEntity.get(eid) ?? "";
    const stale = !r.source_hash || r.source_hash !== currentHash;
    (statusByEntity[eid] ??= {})[r.locale] = {
      source: r.source ?? "ai",
      updated_at: r.updated_at,
      stale,
    };
  }

  let items = (rows ?? []).map((r: any) => {
    const localeStatus = statusByEntity[r.id] ?? {};
    const localeValues = Object.values(localeStatus);
    const translated = TARGET_LOCALES.filter((l) => l in localeStatus).length;
    const human = localeValues.filter((s) => s.source === "human").length;
    const staleCount = localeValues.filter((s) => s.stale).length;
    return {
      id: r.id,
      slug: (r as any).slug ?? null,
      label: (r as any)[displayCol] ?? "(untitled)",
      translatedCount: translated,
      totalLocales: TARGET_LOCALES.length,
      humanEditedCount: human,
      staleCount,
      byLocale: localeStatus,
    };
  });

  if (staleOnly) {
    items = items.filter((it) => it.staleCount > 0);
  }

  return json({
    ok: true,
    total: count ?? 0,
    locales: [...TARGET_LOCALES],
    items,
  });
}
