"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";

type Session = {
  session_id: string;
  anon_id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  first_at: string;
  last_at: string;
  duration_sec: number;
  events_count: number;
  pages_count: number;
  products_viewed_count: number;
  highest_stage: string;
  visited: boolean;
  viewed_product: boolean;
  added_to_cart: boolean;
  started_checkout: boolean;
  clicked_pay: boolean;
  opened_modal: boolean;
  purchased: boolean;
  abandoned: boolean;
  failed: boolean;
  cancelled: boolean;
  device_type: string | null;
  referrer: string | null;
  utm_source: string | null;
  first_path: string | null;
};

type Resp = { ok: true; range: string; filter: string; sessions: Session[] };

const RANGES: Array<{ key: string; label: string }> = [
  { key: "1d", label: "Last 24h" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

const STAGE_FILTERS: Array<{ key: string; label: string }> = [
  { key: "visited", label: "Visited site" },
  { key: "viewed_product", label: "Viewed a product" },
  { key: "added_to_cart", label: "Added to cart" },
  { key: "started_checkout", label: "Started checkout" },
  { key: "clicked_pay", label: "Clicked Pay" },
  { key: "opened_modal", label: "Opened Razorpay" },
  { key: "purchased", label: "Purchased" },
];

const OUTCOME_FILTERS: Array<{ key: string; label: string }> = [
  { key: "abandoned", label: "Abandoned checkout" },
  { key: "failed", label: "Payment failed/cancelled" },
];

const FILTER_LABEL: Record<string, string> = {
  all: "All sessions",
  ...Object.fromEntries(STAGE_FILTERS.map((f) => [f.key, `Reached: ${f.label}`])),
  ...Object.fromEntries(OUTCOME_FILTERS.map((f) => [f.key, f.label])),
};

const VALID_FILTERS = new Set([
  "all",
  ...STAGE_FILTERS.map((f) => f.key),
  ...OUTCOME_FILTERS.map((f) => f.key),
]);

const VALID_RANGES = new Set(RANGES.map((r) => r.key));

const STAGE_LABEL: Record<string, string> = {
  page_view: "Visited",
  product_view: "Viewed product",
  add_to_cart: "Added to cart",
  checkout_started: "Started checkout",
  pay_clicked: "Clicked Pay",
  payment_modal_opened: "Opened Razorpay",
  order_placed: "Purchased",
};

function fmtDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function SessionsListPage() {
  return (
    <Suspense fallback={null}>
      <SessionsListInner />
    </Suspense>
  );
}

function SessionsListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasRole, ready } = useAuth();

  // URL is the source of truth for the two filters so deep-links from
  // the funnel (e.g. ?range=30d&filter=added_to_cart) round-trip
  // cleanly. Defaults are 7d / abandoned for the no-params case.
  const urlRange = searchParams.get("range");
  const urlFilter = searchParams.get("filter");
  const range =
    urlRange && VALID_RANGES.has(urlRange) ? urlRange : "7d";
  const filter =
    urlFilter && VALID_FILTERS.has(urlFilter) ? urlFilter : "abandoned";

  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  const updateUrl = (next: { range?: string; filter?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.range !== undefined) params.set("range", next.range);
    if (next.filter !== undefined) params.set("filter", next.filter);
    router.replace(`/admin/analytics/sessions?${params.toString()}`);
  };

  useEffect(() => {
    if (!ready) return;
    if (!hasRole("admin")) router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
  }, [ready, hasRole, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch(
          `/api/admin/analytics/sessions?range=${range}&filter=${filter}&limit=500`,
          {
            credentials: "include",
            headers: token ? { authorization: `Bearer ${token}` } : undefined,
            cache: "no-store",
          }
        );
        if (!res.ok) throw new Error(await res.text());
        const j = (await res.json()) as Resp;
        if (!cancelled) setData(j);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range, filter]);

  if (!ready) return null;
  if (!hasRole("admin")) return null;

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/analytics/funnel" className="text-sm text-muted-foreground hover:underline">
            ← Funnel
          </Link>
          <h1 className="text-2xl font-bold">Sessions</h1>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex gap-1 rounded-md border p-1">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={range === r.key ? "default" : "ghost"}
                onClick={() => updateUrl({ range: r.key })}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Select
            value={filter}
            onValueChange={(v) => updateUrl({ filter: v })}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Filter sessions" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All sessions</SelectItem>
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Reached at least</SelectLabel>
                {STAGE_FILTERS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Outcomes</SelectLabel>
                {OUTCOME_FILTERS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-baseline gap-3 flex-wrap">
            <span>
              Showing {data?.sessions.length ?? 0}
              {" "}
              {data?.sessions.length === 1 ? "session" : "sessions"}
            </span>
            <span className="text-sm text-muted-foreground font-normal">
              · {FILTER_LABEL[filter] ?? filter}
              {" "}· sorted by abandoned-checkout first, then recency
              {data && data.sessions.length >= 500 && (
                <span className="text-amber-600">
                  {" "}· capped at 500 — narrow the range or filter
                </span>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Identity</TableHead>
                  <TableHead>Highest stage</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : !data || data.sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                      No sessions in this range and filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.sessions.map((s) => {
                    const stageLabel = STAGE_LABEL[s.highest_stage] ?? s.highest_stage;
                    const stageColor = s.purchased
                      ? "default"
                      : s.abandoned
                        ? "destructive"
                        : "secondary";
                    return (
                      <TableRow key={s.session_id}>
                        <TableCell className="text-xs">
                          {new Date(s.first_at).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.user_id ? (
                            <div className="space-y-0.5">
                              <div className="font-medium">
                                {s.user_name || "(no name)"}
                              </div>
                              {s.user_email && (
                                <div className="text-muted-foreground">
                                  {s.user_email}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="font-mono text-muted-foreground">
                              anon:{s.anon_id.slice(0, 8)}…
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={stageColor as any}>{stageLabel}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.events_count}
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            · {s.pages_count} pages · {s.products_viewed_count} products
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{fmtDuration(s.duration_sec)}</TableCell>
                        <TableCell className="text-xs">
                          {s.utm_source
                            ? `utm:${s.utm_source}`
                            : s.referrer
                              ? new URL(s.referrer).hostname
                              : "direct"}
                        </TableCell>
                        <TableCell className="text-xs capitalize">
                          {s.device_type ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/admin/analytics/sessions/${s.session_id}`}>
                              Timeline →
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
