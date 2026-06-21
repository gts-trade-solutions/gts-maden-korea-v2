"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { adminWrite } from "@/lib/admin/catalog-write";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Admin: currency rate table + manual refresh button.
//
// Rates auto-refresh daily via the Netlify Scheduled Function pinging
// /api/currency/refresh. This page exposes the same endpoint to
// admins for an immediate refresh (useful right after onboarding, or
// when FX moves sharply).
//
// `active` toggle hides a currency from the customer-facing switcher
// without deleting the row — handy if a market is being rolled back.

type CurrencyRow = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  rate_from_inr: number;
  active: boolean;
  last_updated_at: string;
};

export default function CurrenciesAdminPage() {
  const router = useRouter();
  const { hasRole } = useAuth();

  const [rows, setRows] = useState<CurrencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("currency_rates")
      .select("*")
      .order("code", { ascending: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as CurrencyRow[]);
  };

  useEffect(() => {
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [hasRole, router]);

  // Most-recent FX refresh timestamp across all rows. Useful at-a-glance
  // signal so admins know whether the daily cron is alive. Falls back
  // to null if no row has a timestamp yet.
  const lastFetched = (() => {
    const stamps = rows
      .map((r) => r.last_updated_at)
      .filter(Boolean)
      .map((s) => new Date(s).getTime())
      .filter((n) => Number.isFinite(n));
    if (stamps.length === 0) return null;
    return new Date(Math.max(...stamps));
  })();

  const refresh = async () => {
    setRefreshing(true);
    try {
      // Send the Supabase access token as a Bearer header in addition
      // to the cookies. The refresh endpoint's `supabaseRouteClient()`
      // path occasionally fails to resolve a session purely from
      // cookies (e.g. on some SameSite / sub-domain configurations),
      // and falling back to the bearer keeps the admin button working.
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/currency/refresh", {
        method: "POST",
        credentials: "include",
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        toast.error(body?.error || "Refresh failed");
        return;
      }
      toast.success(`Updated ${body.updated} currencies.`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Network error");
    } finally {
      setRefreshing(false);
    }
  };

  const toggleActive = async (code: string, next: boolean) => {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.code === code ? { ...r, active: next } : r)));
    try {
      await adminWrite({
        table: "currency_rates",
        op: "update",
        data: { active: next },
        match: { code },
      });
    } catch (e: any) {
      setRows(prev);
      toast.error(e?.message || "Update failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <div className="container mx-auto py-4 flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push("/admin/settings")}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Currencies</h1>
          </div>
        </header>
        <div className="container mx-auto py-12 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading currencies…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push("/admin/settings")}>
            ← Back
          </Button>
          <h1 className="text-2xl font-bold">Currencies</h1>
        </div>
      </header>

      <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Currencies</CardTitle>
            <CardDescription>
              FX rates auto-refresh daily from open.er-api.com. Use Refresh
              now to pull the latest immediately. Toggle active to hide a
              currency from the customer-facing switcher without deleting
              its row.
            </CardDescription>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Last fetched:</strong>{" "}
              {lastFetched
                ? lastFetched.toLocaleString("en-IN")
                : "never"}
            </p>
          </div>
          <Button onClick={refresh} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh now
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Rate (1 INR =)</TableHead>
                <TableHead>Decimals</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead className="text-right">Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.code}>
                  <TableCell className="font-mono font-semibold">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.symbol}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.rate_from_inr.toFixed(6)}
                  </TableCell>
                  <TableCell>{r.decimals}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {r.last_updated_at
                      ? new Date(r.last_updated_at).toLocaleString("en-IN")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={r.active}
                      onCheckedChange={(next) => toggleActive(r.code, next)}
                      disabled={r.code === "INR"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
