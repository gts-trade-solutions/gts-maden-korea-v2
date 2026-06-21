// /admin/translations — Phase 2.4 dashboard.
//
// Top-of-funnel for the translation admin layer: shows the coverage
// for every entity kind (products, brands, categories, banners) and
// surfaces the most-recent translation activity (which row was
// translated, by AI or a human admin, when).
//
// Each kind card links into a list page (/admin/translations/products,
// /admin/translations/brands, etc.) where admins can drill into a
// specific entity to view / edit / re-translate.

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CoverageResponse = {
  ok: true;
  locales: string[];
  summary: Record<
    string,
    {
      label: string;
      sourceRows: number;
      translatedRows: number;
      fullyCoveredEntities: number;
      byLocale: Record<string, number>;
    }
  >;
  recent: Array<{
    kind: string;
    entity_id: string;
    locale: string;
    source: string;
    updated_at: string;
  }>;
  recentTotal: number;
  recentOffset: number;
  recentLimit: number;
};

const KIND_ORDER = ["products", "brands", "categories", "banners"] as const;
const PAGE_SIZE = 20;

export default function AdminTranslationsDashboard() {
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentPage, setRecentPage] = useState(0);

  async function load(page = recentPage) {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        "/api/admin/content-translations/coverage",
        window.location.origin
      );
      url.searchParams.set("recentLimit", String(PAGE_SIZE));
      url.searchParams.set("recentOffset", String(page * PAGE_SIZE));
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || res.statusText);
      setData(json);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load coverage");
    } finally {
      setLoading(false);
    }
  }

  // Refetch whenever the user pages; the summary cards re-render with
  // the same values (cheap) and the activity table swaps to the new slice.
  useEffect(() => {
    void load(recentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentPage]);

  const locales = data?.locales ?? [];

  return (
    <>
      <AdminBackBar
        title="Translations"
        rightSlot={
          <Button
            onClick={() => void load(recentPage)}
            disabled={loading}
            size="sm"
            variant="outline"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="container mx-auto py-6 space-y-6">
        <p className="text-sm text-muted-foreground max-w-3xl">
          AI-translated content for each entity kind. Click a kind to drill
          into individual entities, edit translations manually, or trigger
          a re-translation. Human-edited rows are locked from automatic
          overwrites.
        </p>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {KIND_ORDER.map((kind) => {
            const s = data?.summary?.[kind];
            if (!s) return <KindCardSkeleton key={kind} kind={kind} />;
            const total = s.sourceRows * locales.length;
            // Defensive clamp: even if the API ever returns a numerator
            // that's larger than the denominator (stale rows, race
            // between source/translation queries, etc.), the rendered
            // value never exceeds 100%. The coverage API is the
            // primary fix; this is belt-and-suspenders.
            const pct =
              total === 0
                ? 0
                : Math.min(100, Math.round((s.translatedRows / total) * 100));
            return (
              <Card key={kind} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="capitalize">{kind}</CardTitle>
                    <Link
                      href={`/admin/translations/${kind}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View all →
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-3xl font-bold tabular-nums">{pct}%</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.translatedRows} / {total} rows
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground tabular-nums">
                      {s.fullyCoveredEntities}
                    </span>{" "}
                    of <span className="tabular-nums">{s.sourceRows}</span> entities fully translated
                    across all {locales.length} locales
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {locales.map((l) => {
                      const n = s.byLocale[l] ?? 0;
                      const isComplete = n === s.sourceRows && n > 0;
                      return (
                        <span
                          key={l}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                            isComplete
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : n > 0
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-muted bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          {l} {n}/{s.sourceRows}
                        </span>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RecentTable rows={data?.recent ?? []} loading={loading && !data} />
          </CardContent>
        </Card>

        <RecentPagination
          page={recentPage}
          pageSize={PAGE_SIZE}
          total={data?.recentTotal ?? 0}
          loading={loading}
          onChange={setRecentPage}
        />
      </div>
    </>
  );
}

// ─── Pagination controls ────────────────────────────────────────────

function RecentPagination({
  page,
  pageSize,
  total,
  loading,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  onChange: (next: number) => void;
}) {
  // Total can be 0 on first paint or when there are no rows. In both
  // cases the controls are useless; hide them entirely instead of
  // showing "0 of 0" awkwardness.
  if (total <= 0) return null;

  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  const atStart = page <= 0;
  const atEnd = page >= lastPage;

  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {start}–{end} of {total}
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

function KindCardSkeleton({ kind }: { kind: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">{kind}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-2 rounded-full bg-muted animate-pulse w-full" />
        <div className="mt-3 h-3 rounded bg-muted animate-pulse w-2/3" />
      </CardContent>
    </Card>
  );
}

function RecentTable({
  rows,
  loading,
}: {
  rows: CoverageResponse["recent"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No translations yet. Run the backfill script or trigger one from a
        kind page.
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-xs uppercase text-muted-foreground border-b">
        <tr>
          <th className="text-left px-4 py-2 font-medium">Kind</th>
          <th className="text-left px-4 py-2 font-medium">Entity</th>
          <th className="text-left px-4 py-2 font-medium">Locale</th>
          <th className="text-left px-4 py-2 font-medium">Source</th>
          <th className="text-left px-4 py-2 font-medium">When</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.kind}-${r.entity_id}-${r.locale}`} className="border-b last:border-b-0">
            <td className="px-4 py-2 capitalize">{r.kind}</td>
            <td className="px-4 py-2">
              <Link
                href={`/admin/translations/${r.kind}/${r.entity_id}`}
                className="text-primary hover:underline font-mono text-xs"
              >
                {r.entity_id.slice(0, 8)}…
              </Link>
            </td>
            <td className="px-4 py-2 font-mono text-xs">{r.locale}</td>
            <td className="px-4 py-2">
              <span
                className={`text-xs rounded-full px-2 py-0.5 ${
                  r.source === "human"
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {r.source === "human" ? "Human edit" : "AI"}
              </span>
            </td>
            <td className="px-4 py-2 text-xs text-muted-foreground tabular-nums">
              {formatWhen(r.updated_at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}
