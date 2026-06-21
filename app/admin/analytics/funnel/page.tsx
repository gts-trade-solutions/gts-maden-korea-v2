"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";

type Stage = { key: string; label: string; count: number };
type Resp = {
  ok: true;
  range: string;
  stages: Stage[];
  total_sessions: number;
};

const RANGES: Array<{ key: string; label: string }> = [
  { key: "1d", label: "Last 24h" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

export default function AdminFunnelPage() {
  const router = useRouter();
  const { hasRole, ready } = useAuth();
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

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
        const res = await fetch(`/api/admin/analytics/funnel?range=${range}`, {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
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
  }, [range]);

  if (!ready) return null;
  if (!hasRole("admin")) return null;

  const top = data?.stages?.[0]?.count ?? 0;

  return (
    <div className="container mx-auto py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Conversion funnel</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/analytics/sessions">View sessions →</Link>
          </Button>
          <div className="flex gap-1 rounded-md border p-1">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                size="sm"
                variant={range === r.key ? "default" : "ghost"}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Funnel by session ·{" "}
            <span className="text-muted-foreground text-sm font-normal">
              {data?.total_sessions ?? 0} sessions
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !data || data.stages.length === 0 ? (
            <p className="text-muted-foreground">No data in this range yet.</p>
          ) : (
            <div className="space-y-4">
              {data.stages.map((s, i) => {
                const prev = i === 0 ? top : data.stages[i - 1].count;
                const pctOfTop = top ? Math.round((s.count / top) * 100) : 0;
                const pctOfPrev = prev ? Math.round((s.count / prev) * 100) : 0;
                const drop =
                  i > 0 && prev > 0
                    ? Math.round(((prev - s.count) / prev) * 100)
                    : 0;
                const href = `/admin/analytics/sessions?range=${range}&filter=${s.key}`;
                return (
                  <Link
                    key={s.key}
                    href={href}
                    className="block rounded-md p-2 -mx-2 hover:bg-muted/60 transition-colors"
                    title={`View ${s.count.toLocaleString("en-IN")} session${s.count === 1 ? "" : "s"} that reached "${s.label}"`}
                  >
                    <div className="flex items-baseline justify-between mb-1 flex-wrap gap-x-3 gap-y-1">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-sm">
                        <span className="font-semibold">
                          {s.count.toLocaleString("en-IN")}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          {s.count === 1 ? "session" : "sessions"} · {pctOfTop}% of top
                        </span>
                        {i > 0 && (
                          <span
                            className={
                              drop > 50
                                ? "text-red-600"
                                : "text-muted-foreground"
                            }
                          >
                            {" · "}
                            {pctOfPrev}% of prev ({drop}% drop-off)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-3 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${pctOfTop}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        Click any stage to see the underlying sessions. Sessions are 30-minute
        windows of a single browser. A session is counted at a stage if any
        event of that stage fired during the window. The biggest drop-offs
        (highlighted in red above) are where
        you should focus your funnel work.
      </p>
    </div>
  );
}
