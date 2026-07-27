"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { KCoin } from "@/components/k-points/KCoin";

type Settings = {
  baseCurrency: string;
  basePointsPerUnit: number;
  redeemCapPercent: number;
  redeemMinPoints: number;
  pointsExpiryDays: number;
  skinAnalyzerCostPoints: number;
  earnOnNet: boolean;
};
type Rule = {
  actionKey: string;
  mode: "percent" | "flat";
  value: number;
  enabled: boolean;
  oneTime: boolean;
};
type Rate = { code: string; pointsPerUnit: number; isAuto: boolean };

const ACTION_LABEL: Record<string, string> = {
  purchase: "Purchase (% of order)",
  signup: "Signup bonus",
  review: "Product review (on approval)",
  referral: "Referral",
};

export default function AdminKPointsPage() {
  const [denied, setDenied] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/k-points/config", { cache: "no-store" });
    if (r.status === 401 || r.status === 403) {
      setDenied(true);
      return;
    }
    const d = await r.json();
    setSettings(d.settings);
    setRules(d.rules ?? []);
    setRates(d.rates ?? []);
    setCurrencies(d.currencies ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (denied)
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16 text-center text-sm text-muted-foreground">
        You don&apos;t have access to this page.
      </div>
    );
  if (!settings)
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  const set = (patch: Partial<Settings>) => setSettings((s) => ({ ...s!, ...patch }));

  async function saveSettings() {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/k-points/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      if (d.rates) setRates(d.rates); // base change recomputes auto rates
      toast.success("Economics saved");
    } catch {
      toast.error("Could not save economics");
    } finally {
      setSaving(false);
    }
  }

  async function saveRule(rule: Rule) {
    try {
      const r = await fetch("/api/admin/k-points/rules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setRules(d.rules ?? rules);
      toast.success(`${ACTION_LABEL[rule.actionKey] ?? rule.actionKey} saved`);
      if (d.backfill && d.backfill.credited > 0) {
        toast.success(
          `Granted signup bonus to ${d.backfill.credited} existing user${d.backfill.credited === 1 ? "" : "s"}` +
            (d.backfill.remaining > 0 ? ` (${d.backfill.remaining} remaining — run backfill again)` : ""),
        );
      }
    } catch {
      toast.error("Could not save rule");
    }
  }

  async function backfillSignup() {
    const r = await fetch("/api/admin/k-points/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "backfill-signup" }),
    });
    const d = await r.json();
    if (d.ok) {
      toast.success(
        `Credited ${d.credited} user${d.credited === 1 ? "" : "s"}` +
          (d.remaining > 0 ? ` — ${d.remaining} remaining, run again` : ""),
      );
    } else {
      toast.error("Backfill failed (is the signup rule enabled with a value?)");
    }
  }

  async function autoConvert() {
    const r = await fetch("/api/admin/k-points/rates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "auto-convert" }),
    });
    const d = await r.json();
    if (d.ok) {
      setRates(d.rates);
      toast.success("All auto rates recomputed from base");
    } else toast.error("Auto-convert failed");
  }

  async function overrideRate(code: string, pointsPerUnit: number) {
    const r = await fetch("/api/admin/k-points/rates", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, pointsPerUnit }),
    });
    const d = await r.json();
    if (d.ok) {
      setRates(d.rates);
      toast.success(`${code} rate pinned`);
    } else toast.error("Could not save rate");
  }

  async function resetRate(code: string) {
    const r = await fetch("/api/admin/k-points/rates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset", code }),
    });
    const d = await r.json();
    if (d.ok) {
      setRates(d.rates);
      toast.success(`${code} back to auto`);
    }
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-2">
        <KCoin className="h-6 w-6" />
        <h1 className="text-2xl font-semibold tracking-tight">K-Points</h1>
      </div>

      {/* Economics */}
      <Card>
        <CardHeader>
          <CardTitle>Economics</CardTitle>
          <CardDescription>
            Base valuation, redemption caps and expiry. All values configurable.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Base currency">
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={settings.baseCurrency}
              onChange={(e) => set({ baseCurrency: e.target.value })}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Points per 1 ${settings.baseCurrency} (base rate)`}>
            <Input
              type="number"
              value={settings.basePointsPerUnit}
              onChange={(e) => set({ basePointsPerUnit: Number(e.target.value) })}
            />
          </Field>
          <Field label="Redeem cap (% of order)">
            <Input
              type="number"
              value={settings.redeemCapPercent}
              onChange={(e) => set({ redeemCapPercent: Number(e.target.value) })}
            />
          </Field>
          <Field label="Min points to redeem">
            <Input
              type="number"
              value={settings.redeemMinPoints}
              onChange={(e) => set({ redeemMinPoints: Number(e.target.value) })}
            />
          </Field>
          <Field label="Points expiry (days, 0 = never)">
            <Input
              type="number"
              value={settings.pointsExpiryDays}
              onChange={(e) => set({ pointsExpiryDays: Number(e.target.value) })}
            />
          </Field>
          <Field label="Skin analyzer cost (points)">
            <Input
              type="number"
              value={settings.skinAnalyzerCostPoints}
              onChange={(e) => set({ skinAnalyzerCostPoints: Number(e.target.value) })}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Switch
              checked={settings.earnOnNet}
              onCheckedChange={(v) => set({ earnOnNet: v })}
              id="earnOnNet"
            />
            <Label htmlFor="earnOnNet">Earn on net paid (exclude points-paid)</Label>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save economics
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Earn rules */}
      <Card>
        <CardHeader>
          <CardTitle>Earn rules</CardTitle>
          <CardDescription>
            How many K-Points each action awards. Purchase uses % of order value;
            the rest are flat point amounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.actionKey}
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <div className="w-48 text-sm font-medium">
                {ACTION_LABEL[rule.actionKey] ?? rule.actionKey}
              </div>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={rule.mode}
                disabled={rule.actionKey !== "purchase" && rule.actionKey !== "referral"}
                onChange={(e) =>
                  setRules((rs) =>
                    rs.map((r) =>
                      r.actionKey === rule.actionKey
                        ? { ...r, mode: e.target.value as "percent" | "flat" }
                        : r,
                    ),
                  )
                }
              >
                <option value="flat">flat points</option>
                <option value="percent">% of order</option>
              </select>
              <Input
                type="number"
                className="w-28"
                value={rule.value}
                onChange={(e) =>
                  setRules((rs) =>
                    rs.map((r) =>
                      r.actionKey === rule.actionKey
                        ? { ...r, value: Number(e.target.value) }
                        : r,
                    ),
                  )
                }
              />
              <span className="text-xs text-muted-foreground">
                {rule.mode === "percent" ? "%" : "points"}
              </span>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(v) =>
                    setRules((rs) =>
                      rs.map((r) =>
                        r.actionKey === rule.actionKey ? { ...r, enabled: v } : r,
                      ),
                    )
                  }
                />
                <span className="text-xs">Enabled</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => saveRule(rule)}>
                Save
              </Button>
              {rule.actionKey === "signup" ? (
                <Button size="sm" variant="ghost" onClick={backfillSignup}>
                  Grant to existing users
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Currency rates */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Currency valuation</CardTitle>
              <CardDescription>
                Points per 1 unit of each currency. Auto rows derive from the base;
                override any currency to pin it.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={autoConvert}>
              <RefreshCw className="mr-2 h-4 w-4" /> Auto-convert all
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Points per 1 unit</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((rate) => (
                  <RateRow
                    key={rate.code}
                    rate={rate}
                    onOverride={overrideRate}
                    onReset={resetRate}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Buy-points packs */}
      <PacksSection />

      {/* Users + manual grant */}
      <UsersSection />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RateRow({
  rate,
  onOverride,
  onReset,
}: {
  rate: Rate;
  onOverride: (code: string, v: number) => void;
  onReset: (code: string) => void;
}) {
  const [val, setVal] = useState(String(rate.pointsPerUnit));
  useEffect(() => setVal(String(rate.pointsPerUnit)), [rate.pointsPerUnit]);
  return (
    <TableRow>
      <TableCell className="font-medium">{rate.code}</TableCell>
      <TableCell>
        <Input
          type="number"
          className="w-40"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            rate.isAuto ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"
          }`}
        >
          {rate.isAuto ? "auto" : "override"}
        </span>
      </TableCell>
      <TableCell className="space-x-2 text-right">
        <Button size="sm" variant="outline" onClick={() => onOverride(rate.code, Number(val))}>
          Pin
        </Button>
        {!rate.isAuto ? (
          <Button size="sm" variant="ghost" onClick={() => onReset(rate.code)}>
            Reset
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

type Pack = {
  id: string;
  points: number;
  bonusPoints: number;
  priceInr: number;
  active: boolean;
  position: number;
};

function PacksSection() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [form, setForm] = useState({ points: "", bonusPoints: "0", priceInr: "" });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/k-points/packs", { cache: "no-store" });
    if (r.ok) setPacks((await r.json()).packs ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function call(method: string, body: any) {
    const r = await fetch("/api/admin/k-points/packs", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (d.ok) {
      setPacks(d.packs ?? []);
      return true;
    }
    toast.error("Save failed");
    return false;
  }

  async function add() {
    const points = Math.floor(Number(form.points));
    const priceInr = Number(form.priceInr);
    if (!points || !priceInr) return toast.error("Points and price required");
    if (await call("POST", { points, bonusPoints: Number(form.bonusPoints) || 0, priceInr })) {
      setForm({ points: "", bonusPoints: "0", priceInr: "" });
      toast.success("Pack added");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buy-points packs</CardTitle>
        <CardDescription>
          Packs customers can purchase. Price is in INR (₹, canonical) and shown
          converted in the storefront.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {packs.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <NumField
              label="Points"
              value={p.points}
              onSave={(v) => call("PATCH", { id: p.id, points: v })}
            />
            <NumField
              label="Bonus"
              value={p.bonusPoints}
              onSave={(v) => call("PATCH", { id: p.id, bonusPoints: v })}
            />
            <NumField
              label="Price ₹"
              value={p.priceInr}
              onSave={(v) => call("PATCH", { id: p.id, priceInr: v })}
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={p.active}
                onCheckedChange={(v) => call("PATCH", { id: p.id, active: v })}
              />
              <span className="text-xs">Active</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600"
              onClick={() => call("DELETE", { id: p.id })}
            >
              Delete
            </Button>
          </div>
        ))}

        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
          <Field label="Points">
            <Input
              type="number"
              className="w-28"
              value={form.points}
              onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
            />
          </Field>
          <Field label="Bonus">
            <Input
              type="number"
              className="w-24"
              value={form.bonusPoints}
              onChange={(e) => setForm((f) => ({ ...f, bonusPoints: e.target.value }))}
            />
          </Field>
          <Field label="Price ₹">
            <Input
              type="number"
              className="w-28"
              value={form.priceInr}
              onChange={(e) => setForm((f) => ({ ...f, priceInr: e.target.value }))}
            />
          </Field>
          <Button size="sm" onClick={add}>
            Add pack
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NumField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (v: number) => void;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        className="w-24"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (Number(v) !== value) onSave(Number(v));
        }}
      />
    </div>
  );
}

function UsersSection() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/k-points/users?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const d = await r.json();
      setUsers(d.users ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function grant(userId: string, points: number, note: string) {
    if (!points) return;
    const r = await fetch("/api/admin/k-points/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, points, note }),
    });
    const d = await r.json();
    if (d.ok) {
      setUsers((us) =>
        us.map((u) => (u.id === userId ? { ...u, balance: d.balance } : u)),
      );
      toast.success(`${points > 0 ? "Granted" : "Deducted"} ${Math.abs(points)} K-Points`);
    } else toast.error(d.error === "INSUFFICIENT_POINTS" ? "Not enough balance" : "Failed");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users — give points directly</CardTitle>
        <CardDescription>Search by email or name, then grant or deduct.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <Input
            placeholder="Search email or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
          <Button type="submit" variant="secondary" disabled={loading}>
            <Search className="mr-2 h-4 w-4" /> Search
          </Button>
        </form>
        <div className="space-y-2">
          {users.map((u) => (
            <GrantRow key={u.id} user={u} onGrant={grant} />
          ))}
          {q && !users.length && !loading ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function GrantRow({
  user,
  onGrant,
}: {
  user: any;
  onGrant: (userId: string, points: number, note: string) => void;
}) {
  const [pts, setPts] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="min-w-[180px] flex-1">
        <div className="text-sm font-medium">{user.name || "—"}</div>
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </div>
      <div className="text-sm">
        Balance:{" "}
        <span className="font-semibold tabular-nums text-amber-600">
          {user.balance?.available ?? 0}
        </span>
      </div>
      <Input
        type="number"
        placeholder="+/- points"
        className="w-32"
        value={pts}
        onChange={(e) => setPts(e.target.value)}
      />
      <Input
        placeholder="Reason (optional)"
        className="w-48"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        size="sm"
        onClick={() => {
          onGrant(user.id, Math.trunc(Number(pts)), note);
          setPts("");
          setNote("");
        }}
      >
        Apply
      </Button>
    </div>
  );
}
