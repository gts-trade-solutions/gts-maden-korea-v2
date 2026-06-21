"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Flag } from "@/components/Flag";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  SUPPORTED_COUNTRIES,
  COUNTRY_PROFILES,
  type CountryCode,
} from "@/lib/countries";

// Admin page for international shipping. Three things live here:
//
//  1. Global slab settings (tare %, buffer %, max-kg cap) — applied to
//     every country's slab lookup at runtime.
//  2. Per-country slab matrix (9 weight brackets, INR base cost).
//  3. Per-country ETA window + notes + active toggle.
//
// India shipping is NOT managed here — that uses /admin/settings
// (threshold + flat fee).

const SLAB_KEYS = [
  "slab_500g_inr",
  "slab_1kg_inr",
  "slab_2kg_inr",
  "slab_3kg_inr",
  "slab_5kg_inr",
  "slab_7kg_inr",
  "slab_10kg_inr",
  "slab_15kg_inr",
  "slab_20kg_inr",
] as const;
type SlabKey = (typeof SLAB_KEYS)[number];

const SLAB_LABELS: Record<SlabKey, string> = {
  slab_500g_inr: "0.5 kg",
  slab_1kg_inr: "1 kg",
  slab_2kg_inr: "2 kg",
  slab_3kg_inr: "3 kg",
  slab_5kg_inr: "5 kg",
  slab_7kg_inr: "7 kg",
  slab_10kg_inr: "10 kg",
  slab_15kg_inr: "15 kg",
  slab_20kg_inr: "20 kg",
};

type RateRow = {
  country: string;
  active: boolean;
  notes: string | null;
  eta_days_min: number | null;
  eta_days_max: number | null;
  updated_at: string | null;
} & Record<SlabKey, number | null>;

type DraftRow = {
  country: CountryCode;
  // All 9 slab inputs as strings — parsed at save time.
  slabs: Record<SlabKey, string>;
  etaMin: string;
  etaMax: string;
  active: boolean;
  notes: string;
  isPersisted: boolean;
  dirty: boolean;
  saving: boolean;
  expanded: boolean;
};

type GlobalSettings = {
  intl_packaging_tare_pct: number;
  intl_buffer_pct: number;
  intl_max_shipping_weight_kg: number;
};

const ELIGIBLE_COUNTRIES = SUPPORTED_COUNTRIES.filter((c) => c !== "IN");

function formatInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `₹${Number(n).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

export default function InternationalShippingPage() {
  const router = useRouter();
  const { hasRole, ready } = useAuth();

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Global settings (tare %, buffer %, max-kg cap).
  const [tare, setTare] = useState<string>("15");
  const [buffer, setBuffer] = useState<string>("20");
  const [cap, setCap] = useState<string>("20");
  const [globalDirty, setGlobalDirty] = useState(false);
  const [savingGlobals, setSavingGlobals] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }

    (async () => {
      setLoadError(null);
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch("/api/admin/settings/international-shipping", {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) {
          const msg = body.error || `HTTP ${res.status}`;
          setLoadError(msg);
          toast.error(msg);
          return;
        }

        const rates: RateRow[] = body.rates ?? [];
        const byCountry = new Map(rates.map((r) => [r.country, r]));

        const settings: GlobalSettings = body.settings ?? {
          intl_packaging_tare_pct: 15,
          intl_buffer_pct: 20,
          intl_max_shipping_weight_kg: 20,
        };
        setTare(String(settings.intl_packaging_tare_pct));
        setBuffer(String(settings.intl_buffer_pct));
        setCap(String(settings.intl_max_shipping_weight_kg));
        setGlobalDirty(false);

        const seeded: DraftRow[] = ELIGIBLE_COUNTRIES.map((c) => {
          const r = byCountry.get(c);
          const slabs = Object.fromEntries(
            SLAB_KEYS.map((k) => [
              k,
              r?.[k] != null ? String(r[k]) : "",
            ])
          ) as Record<SlabKey, string>;
          return {
            country: c,
            slabs,
            etaMin: r?.eta_days_min != null ? String(r.eta_days_min) : "",
            etaMax: r?.eta_days_max != null ? String(r.eta_days_max) : "",
            active: r ? r.active : true,
            notes: r?.notes ?? "",
            isPersisted: !!r,
            dirty: false,
            saving: false,
            expanded: false,
          };
        });

        setDrafts(seeded);
      } catch (e: any) {
        const msg = e?.message || "Failed to load rates";
        setLoadError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, hasRole, router]);

  const totalConfigured = useMemo(
    () => drafts.filter((d) => d.isPersisted && d.active).length,
    [drafts]
  );

  if (!ready) {
    return (
      <>
        <AdminBackBar to="/admin/settings" title="International Shipping" />
        <div className="container mx-auto py-6 max-w-5xl">
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      </>
    );
  }
  if (!hasRole("admin")) return null;

  const updateDraft = (country: CountryCode, patch: Partial<DraftRow>) => {
    setDrafts((rows) =>
      rows.map((r) =>
        r.country === country ? { ...r, ...patch, dirty: true } : r
      )
    );
  };

  const setSlabValue = (country: CountryCode, key: SlabKey, value: string) => {
    setDrafts((rows) =>
      rows.map((r) =>
        r.country === country
          ? { ...r, slabs: { ...r.slabs, [key]: value }, dirty: true }
          : r
      )
    );
  };

  const toggleExpanded = (country: CountryCode) => {
    setDrafts((rows) =>
      rows.map((r) =>
        r.country === country ? { ...r, expanded: !r.expanded } : r
      )
    );
  };

  const saveRow = async (country: CountryCode) => {
    const row = drafts.find((d) => d.country === country);
    if (!row) return;

    // Parse all 9 slab fields.
    const slabPayload: Record<string, number> = {};
    for (const k of SLAB_KEYS) {
      const v = Number(row.slabs[k]);
      if (!Number.isFinite(v) || v < 0) {
        toast.error(`${SLAB_LABELS[k]} must be a number ≥ 0`);
        return;
      }
      slabPayload[k] = v;
    }

    const minStr = row.etaMin.trim();
    const maxStr = row.etaMax.trim();
    const hasEta = minStr !== "" || maxStr !== "";
    let etaMin: number | null = null;
    let etaMax: number | null = null;
    if (hasEta) {
      if (minStr === "" || maxStr === "") {
        toast.error("Both ETA min and max must be set (or both blank)");
        return;
      }
      etaMin = Math.floor(Number(minStr));
      etaMax = Math.floor(Number(maxStr));
      if (
        !Number.isFinite(etaMin) ||
        !Number.isFinite(etaMax) ||
        etaMin < 0 ||
        etaMax < etaMin ||
        etaMax > 180
      ) {
        toast.error("ETA must be 0 ≤ min ≤ max ≤ 180");
        return;
      }
    }

    setDrafts((rs) =>
      rs.map((r) => (r.country === country ? { ...r, saving: true } : r))
    );

    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/settings/international-shipping", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          country,
          ...slabPayload,
          active: row.active,
          notes: row.notes || null,
          eta_days_min: etaMin,
          eta_days_max: etaMax,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        toast.error(body.error || "Save failed");
        return;
      }
      toast.success(`Saved ${country}`);
      setDrafts((rs) =>
        rs.map((r) =>
          r.country === country
            ? { ...r, dirty: false, isPersisted: true, saving: false }
            : r
        )
      );
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
      setDrafts((rs) =>
        rs.map((r) => (r.country === country ? { ...r, saving: false } : r))
      );
    }
  };

  const saveGlobals = async () => {
    const tareNum = Math.floor(Number(tare));
    const bufferNum = Math.floor(Number(buffer));
    const capNum = Math.floor(Number(cap));
    if (!Number.isFinite(tareNum) || tareNum < 0 || tareNum > 100) {
      toast.error("Tare % must be a whole number 0..100");
      return;
    }
    if (!Number.isFinite(bufferNum) || bufferNum < 0 || bufferNum > 100) {
      toast.error("Buffer % must be a whole number 0..100");
      return;
    }
    if (!Number.isFinite(capNum) || capNum < 1 || capNum > 100) {
      toast.error("Max weight must be a whole number 1..100 kg");
      return;
    }
    setSavingGlobals(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/settings/international-shipping", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          intl_packaging_tare_pct: tareNum,
          intl_buffer_pct: bufferNum,
          intl_max_shipping_weight_kg: capNum,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) {
        toast.error(body.error || "Save failed");
        return;
      }
      toast.success("Global settings saved");
      setGlobalDirty(false);
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSavingGlobals(false);
    }
  };

  return (
    <>
      <AdminBackBar to="/admin/settings" title="International Shipping" />

      <div className="container mx-auto py-6 space-y-6 max-w-5xl">
        <p className="text-sm text-muted-foreground">
          International orders use Korea Post EMS weight slabs. For each
          destination, set the base INR cost at each of nine weight
          brackets. Three global knobs (below) shape how the bracket
          lookup runs: a <strong>tare %</strong> inflates the cart&apos;s
          gross weight to cover packaging, a <strong>buffer %</strong> is
          added on top of the chosen slab to give the customer-facing
          price, and the <strong>max weight</strong> blocks checkout
          above its threshold with a contact-us message. India isn&apos;t
          listed here — it uses the existing threshold + flat-fee
          configuration in Settings → Shipping.
        </p>

        {/* GLOBAL SETTINGS */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Global settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-[1fr_1fr_1fr_auto] sm:gap-3 sm:items-end">
            <label className="block">
              <div className="text-xs font-medium mb-1">
                Packaging tare (%)
              </div>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={tare}
                onChange={(e) => {
                  setTare(e.target.value);
                  setGlobalDirty(true);
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Inflates the cart&apos;s gross weight before slab lookup.
                Covers shipping-box, bubble-wrap, etc.
              </p>
            </label>
            <label className="block">
              <div className="text-xs font-medium mb-1">Buffer (%)</div>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={buffer}
                onChange={(e) => {
                  setBuffer(e.target.value);
                  setGlobalDirty(true);
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Markup over EMS base cost shown to the customer. Covers
                FX swings + handling.
              </p>
            </label>
            <label className="block">
              <div className="text-xs font-medium mb-1">Max weight (kg)</div>
              <Input
                type="number"
                min="1"
                max="100"
                step="1"
                value={cap}
                onChange={(e) => {
                  setCap(e.target.value);
                  setGlobalDirty(true);
                }}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Hard cap (post-tare). Checkout is blocked above this.
              </p>
            </label>
            <div>
              <Button
                onClick={saveGlobals}
                disabled={savingGlobals || !globalDirty}
                className="w-full sm:w-auto"
              >
                {savingGlobals ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : `${totalConfigured} of ${ELIGIBLE_COUNTRIES.length} countries active.`}
        </div>

        {loadError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <strong>Couldn&apos;t load rates.</strong>
            <p className="mt-1 text-xs font-mono">{loadError}</p>
            <p className="mt-1 text-xs">
              If this keeps happening, sign out and back in to refresh
              your admin session, then reload this page.
            </p>
          </div>
        )}

        {/* PER-COUNTRY SLAB ROWS */}
        <div className="space-y-2">
          {loading && (
            <p className="text-sm text-muted-foreground">Loading rates…</p>
          )}
          {!loading &&
            drafts.map((d) => {
              const profile = COUNTRY_PROFILES[d.country];
              return (
                <Card
                  key={d.country}
                  className={d.dirty ? "ring-2 ring-amber-300/60" : ""}
                >
                  {/* Clickable header. Implemented as a div + role="button"
                      (not a real <button>) because a <button> can't legally
                      contain block-level children — when nested, the
                      browser ejects them and the flag goes missing. */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpanded(d.country)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpanded(d.country);
                      }
                    }}
                    aria-expanded={d.expanded}
                    className="w-full text-left px-6 py-3 flex flex-row items-center gap-3 cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-xl"
                  >
                    <Flag
                      code={d.country}
                      width={24}
                      className="rounded-[2px] shrink-0"
                      alt=""
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{profile.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {d.country}
                        </span>
                        {!d.isPersisted && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            Not set
                          </span>
                        )}
                        {d.isPersisted && !d.active && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 border">
                            Inactive
                          </span>
                        )}
                        {d.dirty && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            Unsaved
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                        0.5 kg: {formatInr(Number(d.slabs.slab_500g_inr))} ·
                        {" "}5 kg: {formatInr(Number(d.slabs.slab_5kg_inr))} ·
                        {" "}20 kg: {formatInr(Number(d.slabs.slab_20kg_inr))}
                        {d.etaMin && d.etaMax && (
                          <span>
                            {" "}· {d.etaMin}–{d.etaMax} days
                          </span>
                        )}
                      </div>
                    </div>
                    {d.expanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {d.expanded && (
                    <CardContent className="pt-0 space-y-4">
                      {/* 9 slab inputs in a 3x3 grid */}
                      <div>
                        <div className="text-xs font-medium mb-2">
                          Base cost per slab (₹, no buffer)
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-5">
                          {SLAB_KEYS.map((k) => (
                            <label key={k} className="block">
                              <div className="text-[11px] text-muted-foreground mb-1">
                                {SLAB_LABELS[k]}
                              </div>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={d.slabs[k]}
                                onChange={(e) =>
                                  setSlabValue(d.country, k, e.target.value)
                                }
                                placeholder="0.00"
                                className="h-8 tabular-nums"
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                        <div>
                          <div className="text-xs font-medium mb-1">
                            Delivery ETA (days)
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              max="180"
                              step="1"
                              value={d.etaMin}
                              onChange={(e) =>
                                updateDraft(d.country, {
                                  etaMin: e.target.value,
                                })
                              }
                              placeholder="min"
                              className="h-8 w-20"
                            />
                            <span className="text-muted-foreground text-xs">
                              –
                            </span>
                            <Input
                              type="number"
                              min="0"
                              max="180"
                              step="1"
                              value={d.etaMax}
                              onChange={(e) =>
                                updateDraft(d.country, {
                                  etaMax: e.target.value,
                                })
                              }
                              placeholder="max"
                              className="h-8 w-20"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium mb-1">
                            Internal notes (optional)
                          </div>
                          <Input
                            value={d.notes}
                            onChange={(e) =>
                              updateDraft(d.country, { notes: e.target.value })
                            }
                            placeholder="e.g. Region 3 (Europe)"
                            className="h-8"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-2 sm:pt-0">
                          <Switch
                            checked={d.active}
                            onCheckedChange={(v) =>
                              updateDraft(d.country, { active: v })
                            }
                          />
                          <span className="text-xs text-muted-foreground">
                            Active
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant={d.dirty ? "default" : "outline"}
                          onClick={() => saveRow(d.country)}
                          disabled={d.saving || !d.dirty}
                        >
                          {d.saving ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : null}
                          {d.saving ? "Saving…" : "Save changes"}
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
        </div>

        <p className="text-xs text-muted-foreground">
          India uses the existing <code>Settings → Shipping</code> threshold
          + flat-fee configuration, not this table.
        </p>
      </div>
    </>
  );
}
