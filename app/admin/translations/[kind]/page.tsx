// /admin/translations/[kind] — list of in-scope entities (products
// published, all brands, all categories, active banners) with
// per-locale translation status. Each row links into the editor.
//
// Top filter for searching by name; per-row "Translate" button to
// retranslate one entity from scratch.

"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Item = {
  id: string;
  slug: string | null;
  label: string;
  translatedCount: number;
  totalLocales: number;
  humanEditedCount: number;
  staleCount: number;
  byLocale: Record<
    string,
    { source: string; updated_at: string; stale: boolean }
  >;
};

type Response = {
  ok: true;
  total: number;
  locales: string[];
  items: Item[];
};

const VALID_KINDS = ["products", "brands", "categories", "banners"] as const;
type Kind = (typeof VALID_KINDS)[number];

const PAGE_SIZE = 25;

export default function AdminTranslationsKindList() {
  const params = useParams();
  const router = useRouter();
  const kind = params?.kind as Kind | undefined;

  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  // `appliedQuery` is the search the current page reflects (vs `q`
  // which is whatever the user is typing). Submitting the form syncs
  // them and resets to page 0.
  const [appliedQuery, setAppliedQuery] = useState("");
  const [showStaleOnly, setShowStaleOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [translating, startTranslating] = useTransition();
  const [bulkBusy, setBulkBusy] = useState(false);
  // Progress state for the bulk translate buttons. `total` is the
  // entity count the job started with; `done` increments after each
  // entity finishes (success OR error). null = no job running.
  const [bulkProgress, setBulkProgress] = useState<{
    total: number;
    done: number;
    translated: number;
    errors: number;
    label: string;
  } | null>(null);

  // Redirect bad slugs to the dashboard so we don't render an empty
  // table for unsupported kinds (e.g. someone hits /admin/translations/foo).
  useEffect(() => {
    if (kind && !VALID_KINDS.includes(kind)) {
      router.replace("/admin/translations");
    }
  }, [kind, router]);

  async function load(query: string, pageIndex: number, stale: boolean) {
    if (!kind || !VALID_KINDS.includes(kind)) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        `/api/admin/content-translations/${kind}`,
        window.location.origin
      );
      if (query.trim()) url.searchParams.set("q", query.trim());
      if (stale) url.searchParams.set("stale", "1");
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(pageIndex * PAGE_SIZE));
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || res.statusText);
      setData(json);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  // Refetch on (kind, page, appliedQuery, showStaleOnly) change. The
  // search box drives `appliedQuery` via form submit so a stray
  // keystroke doesn't trigger a paged refetch per character.
  useEffect(() => {
    void load(appliedQuery, page, showStaleOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, page, appliedQuery, showStaleOnly]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // A new query invalidates the current page; jump back to page 0
    // so the admin sees the first slice of results.
    setPage(0);
    setAppliedQuery(q);
  };

  function translateOne(id: string, force: boolean) {
    if (!kind) return;
    startTranslating(async () => {
      try {
        const res = await fetch("/api/admin/content-translations/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, id, force }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || res.statusText);
        const r = json.result;
        toast.success(
          `${r.translated} translated, ${r.skipped} skipped, ${r.humanLocked} human-locked${
            r.errors.length ? `, ${r.errors.length} errors` : ""
          }`
        );
        // Reload the current page so the row's status badges refresh
        // without scrolling the admin back to page 0.
        await load(appliedQuery, page, showStaleOnly);
      } catch (err: any) {
        toast.error(err?.message ?? "Translation failed");
      }
    });
  }

  // Entity-level concurrency cap for any bulk translate. Each request
  // fans out to up to 5 parallel locale calls server-side (see
  // lib/contentTranslator.ts), so 3 entities at once means ~15
  // simultaneous Anthropic requests. Well under any plausible tier
  // limit, ~3x faster than fully sequential.
  const ENTITY_CONCURRENCY = 3;

  // Predicate for "needs work": entity has either MISSING locales (we
  // haven't translated everything yet) OR STALE locales (source has
  // drifted since translation). Both cases use force=false on the
  // translator, which means:
  //   - Missing → translate
  //   - Stale (AI) → retranslate
  //   - Stale (human) → skip (human-locked); admin can force via editor
  //   - In sync → skip
  // So we can run them through one loop without distinguishing.
  function needsWork(it: Item): boolean {
    return it.translatedCount < it.totalLocales || it.staleCount > 0;
  }

  async function runBulkTranslate(items: Item[], label: string) {
    if (items.length === 0) {
      toast.info("Nothing to translate.");
      return;
    }
    if (
      !confirm(
        `Translate missing + stale locales for ${items.length} ${
          items.length === 1 ? "entity" : "entities"
        }? Human-edited rows are skipped — use the editor's Force re-translate to overwrite those.`
      )
    ) {
      return;
    }
    setBulkBusy(true);
    // Initialise the progress overlay. Live counters live inside the
    // run loop and we snapshot them into state after every entity so
    // the progress bar advances roughly per-entity instead of in big
    // chunks.
    setBulkProgress({
      total: items.length,
      done: 0,
      translated: 0,
      errors: 0,
      label,
    });

    let translated = 0;
    let errors = 0;
    let done = 0;

    const runOne = async (it: Item) => {
      try {
        const res = await fetch("/api/admin/content-translations/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, id: it.id, force: false }),
        });
        const j = await res.json();
        if (!res.ok || !j?.ok) {
          errors += 1;
        } else {
          translated += Number(j.result?.translated ?? 0);
        }
      } catch {
        errors += 1;
      } finally {
        done += 1;
        // Snapshot into React state so the progress bar redraws.
        // Functional update so we don't read stale state when the
        // chunked Promise.all calls finish out of order.
        setBulkProgress((p) =>
          p
            ? { ...p, done, translated, errors }
            : p
        );
      }
    };
    for (let i = 0; i < items.length; i += ENTITY_CONCURRENCY) {
      const chunk = items.slice(i, i + ENTITY_CONCURRENCY);
      await Promise.all(chunk.map(runOne));
    }

    setBulkBusy(false);
    if (errors > 0) {
      toast.error(
        `${label}: ${translated} locales translated, ${errors} entities errored.`
      );
    } else {
      toast.success(
        `${label}: ${translated} locales translated across ${items.length} entities.`
      );
    }
    // Refresh the table data, then clear the progress overlay so the
    // user can see the final counts before it dismisses.
    await load(appliedQuery, page, showStaleOnly);
    // Small delay so admins reading the final "X/Y done" tally see it
    // hit 100% before the bar disappears.
    setTimeout(() => setBulkProgress(null), 1500);
  }

  // Page-scoped: catches missing AND stale entities visible on the
  // current page. Cheap to run — bounded by PAGE_SIZE.
  async function translatePendingOnPage() {
    if (!data || !kind) return;
    const pending = data.items.filter(needsWork);
    await runBulkTranslate(pending, "On this page");
  }

  // Full-catalog: fetches every entity that matches the current search
  // (no pagination, capped at the API's max), filters to those that
  // need work, and runs them. Used right after adding a new locale or
  // when the admin wants to clear the entire backlog at once.
  async function translateAllPending() {
    if (!kind) return;
    setBulkBusy(true);
    try {
      const url = new URL(
        `/api/admin/content-translations/${kind}`,
        window.location.origin
      );
      if (appliedQuery.trim()) url.searchParams.set("q", appliedQuery.trim());
      // Pull a large page; the list API clamps at 200. For larger
      // catalogs we'd paginate here, but 200 is plenty for now.
      url.searchParams.set("limit", "200");
      url.searchParams.set("offset", "0");
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "Failed to fetch entities");
        setBulkBusy(false);
        return;
      }
      const all: Item[] = (json.items as Item[]) ?? [];
      const pending = all.filter(needsWork);
      setBulkBusy(false);
      await runBulkTranslate(pending, "Across all entities");
    } catch (err: any) {
      setBulkBusy(false);
      toast.error(err?.message ?? "Failed to load entities for bulk translate");
    }
  }

  return (
    <>
      <AdminBackBar
        to="/admin/translations"
        title={
          kind ? `Translations · ${kind[0].toUpperCase()}${kind.slice(1)}` : "Translations"
        }
        rightSlot={
          <Button
            onClick={() => void load(appliedQuery, page, showStaleOnly)}
            disabled={loading}
            size="sm"
            variant="outline"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="container mx-auto py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="flex gap-2 flex-1 min-w-[260px] max-w-md">
            <Input
              placeholder="Filter by name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" variant="outline">Search</Button>
          </form>

          <Button
            variant={showStaleOnly ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setPage(0);
              setShowStaleOnly((v) => !v);
            }}
            title="Show only entities where the English source has changed since at least one translation was created"
          >
            {showStaleOnly ? "Showing stale only" : "Show stale only"}
          </Button>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => void translatePendingOnPage()}
            disabled={bulkBusy || loading || !data?.items?.some(needsWork)}
            title="Translates missing locales AND retranslates stale ones for every entity on the current page. Human-edited rows are skipped."
          >
            {bulkBusy ? "Translating…" : "Translate missing on this page"}
          </Button>

          <Button
            size="sm"
            onClick={() => void translateAllPending()}
            disabled={bulkBusy || loading}
            title="Fetches every entity matching the current search and translates missing + stale locales. Use this after adding a new language to fill in the whole catalogue at once."
          >
            {bulkBusy ? "Translating…" : "Translate all missing"}
          </Button>
        </div>

        {bulkProgress && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">
                  {bulkProgress.label}: translating…
                </span>
                <span className="tabular-nums text-muted-foreground text-xs">
                  {bulkProgress.done}/{bulkProgress.total} entities ·{" "}
                  {bulkProgress.translated} locales translated
                  {bulkProgress.errors > 0
                    ? ` · ${bulkProgress.errors} errored`
                    : ""}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${
                      bulkProgress.total === 0
                        ? 0
                        : Math.min(
                            100,
                            Math.round(
                              (bulkProgress.done / bulkProgress.total) * 100
                            )
                          )
                    }%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Up to {ENTITY_CONCURRENCY} entities run in parallel; each
                entity translates up to 5 locales at once. Don&apos;t close
                this page until the bar reaches 100%.
              </p>
            </CardContent>
          </Card>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Coverage</th>
                  <th className="text-left px-4 py-3 font-medium">Locales</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!data && loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {data && data.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No entities match.
                    </td>
                  </tr>
                )}
                {data?.items.map((it) => {
                  const pct = Math.round((it.translatedCount / it.totalLocales) * 100);
                  return (
                    <tr key={it.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/translations/${kind}/${it.id}`}
                          className="hover:underline"
                        >
                          {it.label}
                        </Link>
                        {it.slug && (
                          <div className="text-xs text-muted-foreground font-mono">{it.slug}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 w-48">
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-muted overflow-hidden flex-1">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                            {it.translatedCount}/{it.totalLocales}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {it.humanEditedCount > 0 && (
                            <span className="text-[11px] text-blue-700">
                              {it.humanEditedCount} human-edited
                            </span>
                          )}
                          {it.staleCount > 0 && (
                            <span
                              className="text-[11px] font-medium text-amber-700"
                              title="Source changed since these translations were created"
                            >
                              {it.staleCount} stale
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {data.locales.map((l) => {
                            const s = it.byLocale[l];
                            const isStale = !!s && s.stale === true;
                            return (
                              <span
                                key={l}
                                title={
                                  s
                                    ? `${s.source}${isStale ? " · stale" : ""} · ${s.updated_at}`
                                    : "Not translated"
                                }
                                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${
                                  !s
                                    ? "border-muted bg-muted/40 text-muted-foreground"
                                    : isStale
                                      ? "border-amber-300 bg-amber-50 text-amber-900"
                                      : s.source === "human"
                                        ? "border-blue-200 bg-blue-50 text-blue-700"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {l}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant={it.staleCount > 0 ? "default" : "ghost"}
                          size="sm"
                          onClick={() => translateOne(it.id, false)}
                          disabled={translating}
                          title={
                            it.staleCount > 0
                              ? "Retranslate stale locales (human-edited rows are skipped)"
                              : "Translate any missing locales"
                          }
                        >
                          {it.staleCount > 0
                            ? "Retranslate stale"
                            : "Translate missing"}
                        </Button>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="ml-2"
                        >
                          <Link href={`/admin/translations/${kind}/${it.id}`}>Edit</Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <KindPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          shown={data?.items.length ?? 0}
          loading={loading}
          onChange={setPage}
        />
      </div>
    </>
  );
}

// ─── Pagination controls ────────────────────────────────────────────

function KindPagination({
  page,
  pageSize,
  total,
  shown,
  loading,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  shown: number;
  loading: boolean;
  onChange: (next: number) => void;
}) {
  if (total <= 0) return null;

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const start = page * pageSize + 1;
  const end = page * pageSize + shown;
  const atStart = page <= 0;
  const atEnd = page >= lastPage;

  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {start}–{end} of {total} entities
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={atStart || loading}
          onClick={() => onChange(0)}
          aria-label="First page"
        >
          «
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={atStart || loading}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          ‹ Prev
        </Button>
        <span className="px-2 text-xs text-muted-foreground tabular-nums">
          Page {page + 1} / {lastPage + 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={atEnd || loading}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          Next ›
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={atEnd || loading}
          onClick={() => onChange(lastPage)}
          aria-label="Last page"
        >
          »
        </Button>
      </div>
    </div>
  );
}
