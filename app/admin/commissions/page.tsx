"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

// Admin K-Partnership commissions surface.
// - Top card: auto-approve-days setting (0 = immediate, N = delay).
// - Tabs: Pending / Approved / Voided rows with per-row action buttons.
//
// Commission amounts are stored in INR canonical (see razorpay/verify
// post-Phase-1 fix), so this view is currency-clean — no mixed sums.

type AttribRow = {
  order_id: string;
  influencer_id: string;
  commission_amount: number;
  commission_percent: number;
  currency: string;
  status: "pending" | "approved" | "voided";
  created_at: string;
  attributed_by: string;
  promo_code_id: string | null;
  order: {
    id: string;
    order_number: string | null;
    paid_at: string | null;
    status: string;
    total_inr: number | null;
    total: number;
    currency: string;
  } | null;
  influencer: {
    user_id: string;
    handle: string | null;
    display_name: string | null;
  } | null;
};

type Tab = "pending" | "approved" | "voided";

export default function AdminCommissionsPage() {
  const router = useRouter();
  const { hasRole, ready } = useAuth();

  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<AttribRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  // Auto-approve setting
  const [autoDays, setAutoDays] = useState<number>(0);
  const [autoDaysDirty, setAutoDaysDirty] = useState(false);
  const [autoBounds, setAutoBounds] = useState({ min: 0, max: 90 });
  const [savingDays, setSavingDays] = useState(false);

  const fetchRows = async (selected: Tab) => {
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(
        `/api/admin/commissions?status=${encodeURIComponent(selected)}&limit=200`,
        {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || "Failed to load commissions");
        return;
      }
      setRows(body.rows ?? []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load commissions");
    } finally {
      setLoading(false);
    }
  };

  const fetchAutoDays = async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(
        "/api/admin/settings/commission-auto-approve",
        {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        }
      );
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) {
        setAutoDays(Number(body.days) || 0);
        if (body.bounds) setAutoBounds(body.bounds);
      }
    } catch {}
  };

  useEffect(() => {
    if (!ready) return;
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }
    fetchAutoDays();
    fetchRows(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasRole, router]);

  useEffect(() => {
    if (!ready || !hasRole("admin")) return;
    fetchRows(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (!ready) {
    return (
      <>
        <AdminBackBar to="/admin" title="K-Partnership Commissions" />
        <div className="container mx-auto py-6 max-w-5xl">
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      </>
    );
  }
  if (!hasRole("admin")) return null;

  const setStatus = async (
    orderId: string,
    status: "approved" | "voided" | "pending"
  ) => {
    setBusyRow(orderId);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/commissions", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ order_id: orderId, status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || "Update failed");
        return;
      }
      toast.success(`Marked ${status}`);
      // Row will disappear from the current tab; just refresh.
      await fetchRows(tab);
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setBusyRow(null);
    }
  };

  const saveAutoDays = async () => {
    const value = Math.floor(Number(autoDays));
    if (!Number.isFinite(value) || value < autoBounds.min || value > autoBounds.max) {
      toast.error(`Days must be ${autoBounds.min}..${autoBounds.max}`);
      return;
    }
    setSavingDays(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/settings/commission-auto-approve", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ days: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || "Failed to save");
        return;
      }
      toast.success(`Auto-approve set to ${value} day${value === 1 ? "" : "s"}`);
      setAutoDaysDirty(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSavingDays(false);
    }
  };

  return (
    <>
      <AdminBackBar to="/admin" title="K-Partnership Commissions" />

      <div className="container mx-auto py-6 max-w-5xl space-y-4">
        {/* Auto-approve setting */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <div className="text-sm font-medium">Auto-approve window</div>
              <div className="text-xs text-muted-foreground">
                Days after order paid before a pending commission auto-approves
                and becomes withdrawable. <strong>0</strong> approves
                immediately on payment verification. Typical industry value
                is 14 (covers the return window).
              </div>
            </div>
            <input
              type="number"
              min={autoBounds.min}
              max={autoBounds.max}
              step={1}
              value={autoDays}
              onChange={(e) => {
                setAutoDays(Number(e.target.value));
                setAutoDaysDirty(true);
              }}
              className="border rounded px-2 py-1 w-20 text-right"
            />
            <span className="text-xs text-muted-foreground">days</span>
            <Button
              onClick={saveAutoDays}
              disabled={savingDays || !autoDaysDirty}
              size="sm"
            >
              {savingDays ? "Saving…" : "Save"}
            </Button>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {(["pending", "approved", "voided"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Rows */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Order</th>
                  <th className="text-left px-4 py-3 font-medium">Influencer</th>
                  <th className="text-right px-4 py-3 font-medium">Commission</th>
                  <th className="text-left px-4 py-3 font-medium">Source</th>
                  <th className="text-left px-4 py-3 font-medium">Paid at</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No {tab} commissions.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.order_id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">
                        {r.order?.order_number ?? r.order_id.slice(0, 8) + "…"}
                      </div>
                      {r.order && (
                        <div className="text-xs text-muted-foreground">
                          {r.order.currency} {Number(r.order.total).toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {r.influencer?.handle ?? r.influencer?.display_name ?? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {r.influencer_id.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="font-medium">
                        ₹{Number(r.commission_amount).toFixed(2)}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {Number(r.commission_percent).toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.attributed_by}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                      {r.order?.paid_at
                        ? new Date(r.order.paid_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {tab === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyRow === r.order_id}
                            onClick={() => setStatus(r.order_id, "approved")}
                            className="mr-1"
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyRow === r.order_id}
                            onClick={() => setStatus(r.order_id, "voided")}
                            className="text-red-700 hover:bg-red-50"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Void
                          </Button>
                        </>
                      )}
                      {tab === "approved" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyRow === r.order_id}
                          onClick={() => setStatus(r.order_id, "voided")}
                          className="text-red-700 hover:bg-red-50"
                        >
                          Void
                        </Button>
                      )}
                      {tab === "voided" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyRow === r.order_id}
                          onClick={() => setStatus(r.order_id, "pending")}
                        >
                          Reopen
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
