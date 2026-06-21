"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";

type Event = {
  id: string;
  occurred_at: string;
  event_name: string;
  path: string | null;
  props: Record<string, any> | null;
  product: { name: string; slug: string } | null;
};

type Session = {
  session_id: string;
  anon_id: string;
  user_id: string | null;
  customer: { name: string | null; email: string | null } | null;
  first_at: string;
  last_at: string;
  events_count: number;
  device: { type?: string; os?: string; browser?: string } | null;
  ip_prefix: string | null;
  user_agent: string | null;
  utm: Record<string, string> | null;
  referrer: string | null;
};

type Resp = { ok: true; session: Session; events: Event[] };

const EVENT_COLOR: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  page_view: "outline",
  product_view: "secondary",
  add_to_cart: "secondary",
  remove_from_cart: "outline",
  checkout_started: "secondary",
  pay_clicked: "secondary",
  payment_modal_opened: "secondary",
  payment_succeeded: "default",
  payment_failed: "destructive",
  payment_cancelled: "destructive",
  order_placed: "default",
  pincode_blocked: "destructive",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDelta(prevIso: string | null, nextIso: string) {
  if (!prevIso) return "0s";
  const ms = new Date(nextIso).getTime() - new Date(prevIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

export default function SessionTimelinePage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = String(params?.id || "");
  const { hasRole, ready } = useAuth();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!hasRole("admin")) router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
  }, [ready, hasRole, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch(`/api/admin/analytics/sessions/${sessionId}`, {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || "Failed to load session");
        }
        const j = (await res.json()) as Resp;
        if (!cancelled) setData(j);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!ready) return null;
  if (!hasRole("admin")) return null;

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/admin/analytics/sessions"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Sessions
        </Link>
        <h1 className="text-2xl font-bold">Session timeline</h1>
      </div>

      {loading && !data ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : !data ? null : (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Visitor</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <Row k="Session ID" v={<code className="text-xs">{data.session.session_id}</code>} />
              <Row
                k="Identity"
                v={
                  data.session.customer ? (
                    <>
                      <span className="font-medium">
                        {data.session.customer.name || "(no name)"}
                      </span>
                      {data.session.customer.email && (
                        <span className="text-muted-foreground"> · {data.session.customer.email}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      Anonymous (anon_id: <code className="text-xs">{data.session.anon_id}</code>)
                    </span>
                  )
                }
              />
              <Row
                k="Window"
                v={
                  <>
                    {new Date(data.session.first_at).toLocaleString("en-IN")} →{" "}
                    {new Date(data.session.last_at).toLocaleString("en-IN")} ·{" "}
                    {data.session.events_count} events
                  </>
                }
              />
              <Row
                k="Device"
                v={
                  data.session.device
                    ? `${data.session.device.type ?? "?"} · ${data.session.device.os ?? "?"} · ${data.session.device.browser ?? "?"}`
                    : "—"
                }
              />
              <Row
                k="Source"
                v={
                  data.session.utm?.source
                    ? `utm: ${data.session.utm.source} / ${data.session.utm.medium ?? "?"}`
                    : data.session.referrer
                      ? data.session.referrer
                      : "direct"
                }
              />
              <Row k="IP prefix" v={data.session.ip_prefix ?? "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Events</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative border-l border-muted pl-5 space-y-4">
                {data.events.map((e, i) => {
                  const prev = i === 0 ? null : data.events[i - 1].occurred_at;
                  const variant = EVENT_COLOR[e.event_name] ?? "outline";
                  const productLabel = e.product
                    ? `${e.product.name}`
                    : (e.props as any)?.product_id
                      ? `product ${(e.props as any).product_id.slice(0, 8)}…`
                      : null;
                  return (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-primary" />
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {fmtTime(e.occurred_at)}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          (+{fmtDelta(prev, e.occurred_at)})
                        </span>
                        <Badge variant={variant}>{e.event_name}</Badge>
                        {productLabel && (
                          <span className="text-sm">{productLabel}</span>
                        )}
                        {e.path && e.event_name === "page_view" && (
                          <span className="text-xs text-muted-foreground font-mono">{e.path}</span>
                        )}
                      </div>
                      {e.props && Object.keys(e.props).length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            props
                          </summary>
                          <pre className="mt-1 text-xs bg-muted/50 rounded p-2 overflow-auto">
                            {JSON.stringify(e.props, null, 2)}
                          </pre>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <span className="text-muted-foreground w-24 shrink-0">{k}</span>
      <span className="flex-1">{v}</span>
    </div>
  );
}
