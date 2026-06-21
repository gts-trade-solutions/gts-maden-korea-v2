"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useTranslations } from "next-intl";
import { useAuthSession, clientAuthToken } from "@/lib/auth/clientAuth";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import {
  Wallet,
  IndianRupee,
  TrendingUp,
  CheckCircle2,
  Clock,
  Share2,
  ChevronRight,
  Send,
  BadgePercent,
  Copy,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { COUNTRY_PROFILES } from "@/lib/countries";
import { CountryFlag } from "@/components/CountryFlag";

/* ---------- Types ---------- */
type PromoRow = {
  id: string;
  code: string;
  scope?: "global" | "product"; // we only create/manage global here
  product_id?: string | null; // should be null for global
  active: boolean;
  discount_percent: number; // customer %
  commission_percent: number; // influencer %
  uses?: number;
  max_uses?: number | null;
};

type PayoutRow = {
  id: string;
  amount: number;
  currency?: string | null;
  status: "initiated" | "processing" | "paid" | "failed" | "canceled";
  notes?: string | null;
  created_at: string;
  paid_at?: string | null;
  covering_orders?: string[] | null;
};

type SummaryResp = {
  lifetime_commission: number;
  pending_total: number;
  paid_total: number;
  available_to_withdraw: number;
};

type WalletData = {
  // Indian rails
  upi_id?: string | null;
  bank?: {
    name?: string | null;
    number?: string | null;
    ifsc?: string | null;
  } | null;
  // International bank — SWIFT/IBAN
  bank_intl?: {
    bank_name?: string | null;
    account_holder?: string | null;
    account_number?: string | null;
    swift_bic?: string | null;
    iban?: string | null;
    routing_number?: string | null;
    branch_address?: string | null;
  } | null;
  // Provider-based rails
  paypal_email?: string | null;
  wise_email?: string | null;
  // Influencer's preferred method hint for admin. Informational only.
  preferred_method?: "upi" | "bank" | "bank_intl" | "paypal" | "wise" | null;
};

// Per-influencer cap + default split are admin-managed on
// influencer_profiles. Loaded from /api/me/summary at boot. Fallback
// values are only used until the API responds (which is fast in
// practice) — the form is disabled while loading anyway.
const FALLBACK_CAP = 30;
const FALLBACK_DEFAULT_USER = 15;

/* ---------- Page ---------- */
export default function InfluencerDashboardPage() {
  const supabase = createClientComponentClient();
  // Visitor currency for the dashboard. Stats are stored in INR
  // canonical (see Phase 1 fix in razorpay/verify); we render them
  // converted to the influencer's current `mik_currency` selection
  // as the headline, with INR as a small caption. For INR visitors
  // the caption is suppressed automatically.
  // Note: `useCurrency()` here is the *session* currency (cookie-driven).
  // The influencer dashboard overrides this with their `display_currency`
  // setting from influencer_profiles so amounts don't shift when they
  // toggle the country switcher mid-session. The locked display
  // currency is loaded below and used throughout the page.
  const sessionCurrency = useCurrency();
  const t = useTranslations("influencer");

  // Influencer's locked display currency (from influencer_profiles).
  // Defaults to INR until loaded. We compute a stable rate/format
  // pair below so the dashboard never depends on the mik_currency
  // cookie for rendering amounts.
  const [displayCurrency, setDisplayCurrency] = useState<string>("INR");

  const displayRate =
    sessionCurrency.rates[displayCurrency as keyof typeof sessionCurrency.rates] ??
    sessionCurrency.rates.INR;
  const isINR = displayCurrency === "INR";
  const currency = displayCurrency;
  const formatPrice = (amountInr: number) => {
    if (isINR) {
      return amountInr.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      });
    }
    // Mirror lib/currency.formatPrice but with the LOCKED rate so the
    // displayed value doesn't slide when the cookie currency changes.
    const converted = amountInr * displayRate.rate_from_inr;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: displayCurrency,
        minimumFractionDigits: displayRate.decimals,
        maximumFractionDigits: displayRate.decimals,
      }).format(converted);
    } catch {
      return `${displayRate.symbol}${converted.toFixed(displayRate.decimals)}`;
    }
  };

  // Backend-aware client auth. Supabase → real access_token; NextAuth → a truthy
  // sentinel (auth via the session cookie; fetches below all send credentials).
  const { token } = useAuthSession();

  // Stats
  const [loadingStats, setLoadingStats] = useState(true);
  const [statLifetime, setStatLifetime] = useState(0);
  const [statPending, setStatPending] = useState(0);
  const [statPaid, setStatPaid] = useState(0);
  const [statWallet, setStatWallet] = useState(0);

  // Per-influencer cap settings loaded from /api/me/summary. Until
  // the API responds we use the fallback values so the form has
  // sensible bounds, but the create button stays disabled while
  // loadingStats is true to avoid a flash of stale limits.
  const [cap, setCap] = useState<number>(FALLBACK_CAP);
  const [defaultUserPct, setDefaultUserPct] = useState<number>(FALLBACK_DEFAULT_USER);
  // Region allow-list — empty = active in every supported country.
  // Read-only here; admin manages it from /admin/influencers.
  const [applicableCountries, setApplicableCountries] = useState<string[]>([]);

  // Wallet & payout modals
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [savedWallet, setSavedWallet] = useState<WalletData | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);

  // Promos
  const [promoLoading, setPromoLoading] = useState(false);
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [code, setCode] = useState("");
  const [userPct, setUserPct] = useState(FALLBACK_DEFAULT_USER);
  const [commPct, setCommPct] = useState(FALLBACK_CAP - FALLBACK_DEFAULT_USER); // auto-split
  const sumPct = useMemo(
    () => Number(userPct || 0) + Number(commPct || 0),
    [userPct, commPct]
  );

  // field-level errors
  const [codeError, setCodeError] = useState<string | null>(null);
  const [userPctError, setUserPctError] = useState<string | null>(null);

  const [editing, setEditing] = useState<PromoRow | null>(null);
  const [deleting, setDeleting] = useState<PromoRow | null>(null);

  // Payouts list (compact)
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // messaging
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); // for generic promo list errors

  /* ---------- Auth bootstrap ----------
     `token` now comes from useAuthSession() (Supabase access_token, or a
     NextAuth sentinel). The old supabase.auth.getSession() + /api/auth/attach
     cookie bridge is gone — the /api/me/* calls below authenticate via the
     Bearer header (Supabase) or the NextAuth session cookie. */

  /* ---------- Load locked display currency ---------- */
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch("/api/me/display-currency", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.ok && body.display_currency) {
          setDisplayCurrency(body.display_currency);
        }
      } catch {
        // ignore — INR default is fine
      }
    })();
  }, [token]);

  // Self-serve currency change. Persists immediately; updates the
  // dashboard render on the next paint.
  const updateDisplayCurrency = async (next: string) => {
    if (!token || next === displayCurrency) return;
    try {
      const res = await fetch("/api/me/display-currency", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ display_currency: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) return;
      setDisplayCurrency(next);
    } catch {
      // ignore — non-critical
    }
  };

  /* ---------- Load summary stats ---------- */
  const loadSummary = async (tk: string) => {
    setLoadingStats(true);
    try {
      const r = await fetch("/api/me/summary", {
        headers: { Authorization: `Bearer ${tk}` },
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      console.log(j);
      if (r.ok && j?.ok) {
        setStatLifetime(Number(j.lifetime_commission || 0));
        setStatPending(Number(j.pending_total || 0));
        setStatPaid(Number(j.paid_total || 0));
        setStatWallet(Number(j.available_to_withdraw || 0));
        // Admin-set region allow-list. Empty = active everywhere (the
        // default for every legacy influencer). The dashboard renders
        // this read-only — admin manages it from /admin/influencers.
        if (Array.isArray(j.applicable_countries)) {
          setApplicableCountries(j.applicable_countries as string[]);
        }
        // Cap + default split — admin-managed. If null (shouldn't
        // happen post-migration since all rows were backfilled), keep
        // the fallback values; the create-promo button stays
        // functional and the server-side validator will enforce the
        // real cap if there's a mismatch.
        if (j.commission_cap_pct != null) {
          const c = Number(j.commission_cap_pct);
          setCap(c);
          const d = Number(
            j.default_user_discount_pct != null
              ? j.default_user_discount_pct
              : Math.floor(c / 2)
          );
          setDefaultUserPct(d);
          // Seed the create-promo form with the influencer's
          // admin-set default split. We only do this on first load
          // (when userPct is still at the fallback) so we don't stomp
          // on values the influencer has actively edited mid-session.
          setUserPct((prev) =>
            prev === FALLBACK_DEFAULT_USER ? d : prev
          );
          setCommPct((prev) =>
            prev === FALLBACK_CAP - FALLBACK_DEFAULT_USER ? c - d : prev
          );
        }
      }
    } finally {
      setLoadingStats(false);
    }
  };
  useEffect(() => {
    if (token) loadSummary(token);
  }, [token]);

  /* ---------- Wallet: load (GET /api/me/wallet) ---------- */
  const loadWallet = async () => {
    if (!token) return;
    setWalletLoading(true);
    setWalletError(null);
    try {
      const r = await fetch("/api/me/wallet", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) {
        // no saved wallet yet is OK; just mark disconnected
        setSavedWallet(null);
        setWalletConnected(false);
        if (j?.error) setWalletError(j.error);
      } else {
        const w: WalletData | null = j.wallet || null;
        setSavedWallet(w);
        // Wallet is "connected" if any method is filled out enough to
        // pay against — Indian UPI/bank OR international bank OR a
        // provider email (PayPal/Wise).
        const intl = w?.bank_intl;
        const intlOk =
          !!(
            intl &&
            intl.bank_name &&
            intl.account_holder &&
            intl.account_number &&
            (intl.swift_bic || intl.iban)
          );
        const ok =
          !!w?.upi_id ||
          !!(w?.bank?.number && w?.bank?.ifsc) ||
          intlOk ||
          !!w?.paypal_email ||
          !!w?.wise_email;
        setWalletConnected(ok);
      }
    } catch (e: any) {
      setWalletError(e?.message || "Failed to load wallet");
      setSavedWallet(null);
      setWalletConnected(false);
    } finally {
      setWalletLoading(false);
    }
  };
  useEffect(() => {
    if (token) loadWallet();
  }, [token]);

  /* ---------- Load promos (global only) ---------- */
  const loadPromos = async () => {
    if (!token) return;
    setPromoLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/influencer/promos", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setErr(j?.error || t("errLoadPromos"));
      } else {
        const rows = (j.promos || []).filter(
          (p: any) =>
            (p.scope || (p.product_id ? "product" : "global")) === "global"
        );
        setPromos(rows);
      }
    } catch (e: any) {
      setErr(e?.message || t("errLoadPromos"));
    } finally {
      setPromoLoading(false);
    }
  };
  useEffect(() => {
    if (token) loadPromos();
  }, [token]);

  /* ---------- Create GLOBAL promo ---------- */
  const createPromo = async () => {
    if (!token) {
      setUserPctError(t("errSignInAgain"));
      return;
    }

    // reset field errors
    setCodeError(null);
    setUserPctError(null);

    if (!code.trim()) {
      setCodeError(t("codeErrorEnterCode"));
      return;
    }

    if (userPct < 0 || userPct > cap) {
      setUserPctError(t("customerDiscountError", { max: cap }));
      return;
    }

    const autoComm = Math.max(0, cap - Number(userPct || 0));
    setCommPct(autoComm);

    const payload: Record<string, any> = {
      code: code.trim().toUpperCase(),
      scope: "global",
      discount_percent: Number(userPct),
      commission_percent: autoComm,
      user_discount_pct: Number(userPct), // compat
      commission_pct: autoComm, // compat
    };

    const res = await fetch("/api/influencer/promos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));

    if (!res.ok || j?.ok === false) {
      // Map stable server codes → translated strings; fall back to the
      // server's raw english `error` for anything we don't recognise.
      let message: string;
      if (j?.code === "SETTINGS_NOT_FINALIZED") {
        message = t("errSettingsNotFinalized");
      } else if (j?.code === "SPLIT_EXCEEDS_CAP") {
        message = t("errSplitExceedsCap", { cap: Number(j?.cap ?? cap) });
      } else if (j?.code === "CODE_ALREADY_TAKEN") {
        message = t("errCodeAlreadyTaken");
      } else {
        message = j?.error || t("codeErrorCreateFailed");
      }
      setCodeError(message);
      return;
    }

    setCode("");
    setUserPct(defaultUserPct);
    setCommPct(cap - defaultUserPct);
    setFlash(t("promoCreatedToast"));
    setTimeout(() => setFlash(null), 1500);
    await loadPromos();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFlash(t("copiedToast"));
    } catch {
      setFlash(t("copyFailedToast"));
    }
    setTimeout(() => setFlash(null), 1200);
  };

  /* ---------- Payouts (history on dashboard) ---------- */
  const loadPayouts = async () => {
    if (!token) return;
    setListLoading(true);
    try {
      const res = await fetch("/api/me/payouts", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok) setPayouts((j.payouts || []) as PayoutRow[]);
    } finally {
      setListLoading(false);
    }
  };
  useEffect(() => {
    if (token) loadPayouts();
  }, [token]);

  // Keep this for UX messaging (we no longer hard-block opening the modal with it)
  const canRequest = statWallet > 0.0001;

  // Compact label for the wallet status chip. Shows whichever method
  // the influencer marked as preferred, falling back through the
  // methods in the order they typically prefer (UPI → bank → intl →
  // PayPal → Wise). Truncates account numbers to last 4 for privacy.
  const walletBadgeText = (() => {
    if (walletLoading) return t("walletStatusLoading");
    if (!walletConnected || !savedWallet) return t("walletStatusNotConnected");
    const w = savedWallet;
    const last4 = (s: string | null | undefined) =>
      s ? `****${s.slice(-4)}` : t("walletStatusSaved");
    const labelFor = (m: WalletData["preferred_method"]): string | null => {
      if (m === "upi" && w.upi_id) return t("walletBadgeUpi", { value: w.upi_id });
      if (m === "bank" && w.bank?.number)
        return t("walletBadgeBank", { value: last4(w.bank.number) });
      if (m === "bank_intl" && w.bank_intl?.account_number)
        return t("walletBadgeBankIntl", { value: last4(w.bank_intl.account_number) });
      if (m === "paypal" && w.paypal_email)
        return t("walletBadgePaypal", { value: w.paypal_email });
      if (m === "wise" && w.wise_email)
        return t("walletBadgeWise", { value: w.wise_email });
      return null;
    };
    // Preferred wins if set + populated.
    const preferred = labelFor(w.preferred_method ?? null);
    if (preferred) return preferred;
    // Fallback order.
    return (
      labelFor("upi") ??
      labelFor("bank") ??
      labelFor("bank_intl") ??
      labelFor("paypal") ??
      labelFor("wise") ??
      t("walletStatusSaved")
    );
  })();

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4">
      {/* ===== STATS ROW =====
          Headline number is in the visitor's currency (live FX
          conversion from the INR-canonical stored amount). For non-INR
          visitors we show the INR equivalent as a small caption with
          the "≈" prefix to communicate that the local value is an
          estimate tied to today's FX rate. The actual payout amount
          is always the INR figure — the local view is informational. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          loading={loadingStats}
          icon={<TrendingUp className="h-5 w-5" />}
          label={t("statLifetime")}
          value={isINR ? toINR(statLifetime) : `≈ ${formatPrice(statLifetime)}`}
          subValue={isINR ? undefined : toINR(statLifetime)}
        />
        <StatCard
          loading={loadingStats}
          icon={<Clock className="h-5 w-5" />}
          label={t("statPending")}
          value={isINR ? toINR(statPending) : `≈ ${formatPrice(statPending)}`}
          subValue={isINR ? undefined : toINR(statPending)}
        />
        <StatCard
          loading={loadingStats}
          icon={<CheckCircle2 className="h-5 w-5" />}
          label={t("statPaid")}
          value={isINR ? toINR(statPaid) : `≈ ${formatPrice(statPaid)}`}
          subValue={isINR ? undefined : toINR(statPaid)}
        />
        <StatCard
          loading={loadingStats}
          icon={<IndianRupee className="h-5 w-5" />}
          label={t("statAvailable")}
          value={isINR ? toINR(statWallet) : `≈ ${formatPrice(statWallet)}`}
          subValue={isINR ? undefined : toINR(statWallet)}
        />
      </div>
      {/* Display-currency picker. Self-serve — the influencer locks
          the display to one currency so the dashboard doesn't shift
          when they change the country switcher. Source of truth for
          commissions stays INR; this only affects rendering. */}
      <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-neutral-500">
        <label className="flex items-center gap-2">
          <span>{t("displayCurrencyLabel")}</span>
          <select
            value={displayCurrency}
            onChange={(e) => updateDisplayCurrency(e.target.value)}
            className="rounded border bg-white px-2 py-1 text-xs"
          >
            {Object.keys(sessionCurrency.rates).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {!isINR && (
          <span>{t("localCurrencyEstimateNote", { currency })}</span>
        )}
      </div>

      {/* ===== WALLET & REDEEM ===== */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-50 p-2">
                <Wallet className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <div className="text-sm font-semibold">{t("walletSectionTitle")}</div>
                <p className="text-xs text-neutral-600">
                  {t("walletSectionDesc")}
                </p>
                <p className="mt-1 text-[11px] text-neutral-600">
                  <span className="font-medium">{t("walletStatusLabel")}</span> {walletBadgeText}
                </p>
                {walletError && (
                  <p className="mt-1 text-[11px] text-red-700">{walletError}</p>
                )}
              </div>
            </div>
            <button
              className="rounded-lg border bg-neutral-50 px-3 py-2 text-sm font-medium"
              onClick={() => setShowWalletModal(true)}
            >
              {walletConnected ? t("walletManageCta") : t("walletSetupCta")}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => setShowRedeemModal(true)}
              disabled={loadingStats}
            >
              <Send className="h-4 w-4" />
              {t("payoutRequest")}
            </button>
            <a
              href="/influencer/payouts"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-neutral-50 px-4 py-2.5 text-sm font-semibold"
            >
              {t("payoutHistoryCta")}
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-2 text-[11px] text-neutral-600">
            {t("availableToWithdraw", { amount: toINR(statWallet) })}
          </p>
          {!canRequest && !loadingStats && (
            <p className="mt-1 text-[11px] text-red-600">
              {t("noApprovedBalance")}
            </p>
          )}
        </div>
      </div>

      {/* ===== PROMO SETTINGS (read-only) =====
          Single overview card surfacing the three admin-controlled
          values the influencer needs to know before creating a promo:
          their commission cap, the admin-set default customer share,
          and the regions their promos work in. All three are read-only
          here — admin manages them from /admin/influencers. */}
      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold">
          {t("promoSettingsHeading")}
        </div>

        {/* Cap + default split numbers — surfaced as two stat blocks
            so they're scannable at a glance. The influencer's earnings
            ceiling per promo IS the cap minus the customer share. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-neutral-50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              {t("promoSettingsCapLabel")}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">{cap}%</div>
            <div className="mt-0.5 text-[11px] text-neutral-600">
              {t("promoSettingsCapHelp")}
            </div>
          </div>
          <div className="rounded-lg border bg-neutral-50 p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              {t("promoSettingsDefaultSplitLabel")}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {defaultUserPct}% / {Math.max(0, cap - defaultUserPct)}%
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-600">
              {t("promoSettingsDefaultSplitHelp")}
            </div>
          </div>
          <div className="rounded-lg border bg-neutral-50 p-3 col-span-2 sm:col-span-1">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              {t("regionsHeading")}
            </div>
            <div className="mt-1 text-sm font-medium">
              {applicableCountries.length === 0
                ? t("regionsAll")
                : t("promoSettingsRegionsCount", {
                    count: applicableCountries.length,
                  })}
            </div>
            {applicableCountries.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {applicableCountries.map((code) => {
                  const profile = (COUNTRY_PROFILES as any)[code];
                  if (!profile) return null;
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full border bg-white px-1.5 py-0.5 text-[10px]"
                      title={profile.name}
                    >
                      <CountryFlag code={code} className="inline-block h-3 w-auto rounded-[1px]" />
                      <span>{code}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <p className="mt-3 text-[11px] text-neutral-500">
          {t("regionsAdminManaged")}
        </p>
      </div>

      {/* ===== PROMOS: CREATE + LIST (INLINE) ===== */}
      <div className="mt-4 space-y-4">
        {/* Create */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4" />
              <div className="text-sm font-semibold">{t("createPromoTitle")}</div>
            </div>
            {flash && (
              <div className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                {flash}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">{t("codeLabel")}</label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm uppercase"
                placeholder={t("codePlaceholder")}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setCodeError(null);
                }}
              />
              {codeError && (
                <p className="mt-1 text-[11px] text-red-600">{codeError}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {t("customerDiscountLabel")}
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                type="number"
                min={0}
                max={cap}
                step={0.5}
                value={userPct}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isNaN(raw)) {
                    setUserPct(0);
                    setCommPct(cap);
                    setUserPctError(null);
                    return;
                  }
                  let value = raw;
                  if (value < 0) value = 0;
                  if (value > cap) value = cap;
                  setUserPct(value);
                  setCommPct(cap - value);
                  setUserPctError(null);
                }}
              />
              {userPctError && (
                <p className="mt-1 text-[11px] text-red-600">{userPctError}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                {t("yourCommissionLabel")}
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm bg-neutral-50"
                type="number"
                value={commPct}
                disabled
                readOnly
              />
              <p className="mt-1 text-[11px] text-neutral-600">
                {t("yourCommissionAutoNote", { max: cap })}
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
              onClick={() => {
                setUserPct(defaultUserPct);
                setCommPct(cap - defaultUserPct);
                setUserPctError(null);
                setCodeError(null);
              }}
            >
              <Check className="h-4 w-4" />{" "}
              {t("recommendedSplitBtn", {
                user: defaultUserPct,
                comm: cap - defaultUserPct,
              })}
            </button>
            <p className="text-[11px] text-neutral-600">
              {t("splitTotalNote", { sum: sumPct, cap })}
            </p>
          </div>

          <div className="mt-3">
            <button
              className="w-full rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              onClick={createPromo}
              disabled={!code.trim()}
            >
              {t("createPromoBtn")}
            </button>
          </div>
        </div>

        {/* List + manage */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">{t("yourPromosTitle")}</div>
            {err && (
              <div className="rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700">
                {err}
              </div>
            )}
          </div>
          {promoLoading ? (
            <ListSkeleton />
          ) : promos.length === 0 ? (
            <EmptyState
              title={t("promoListEmptyTitle")}
              desc={t("promoListEmptyDesc")}
            />
          ) : (
            <ul className="divide-y">
              {promos.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-lg border bg-neutral-50 px-2 py-1 text-xs font-semibold">
                        {p.code}
                        <button
                          className="rounded p-1 hover:bg-neutral-100"
                          onClick={() => copy(p.code)}
                          aria-label={t("copyCodeAria")}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </span>
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                        {t("promoListGlobalBadge")}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${
                          p.active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-neutral-100 text-neutral-700"
                        }`}
                      >
                        {p.active ? t("promoListActive") : t("promoListInactive")}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-neutral-600">
                      {t("promoListSplit", { user: p.discount_percent, comm: p.commission_percent })}
                      {typeof p.uses === "number"
                        ? " • " + (p.max_uses
                            ? t("promoListUsesCap", { used: p.uses, cap: p.max_uses })
                            : t("promoListUses", { used: p.uses }))
                        : ""}
                    </div>
                  </div>

                  <div className="flex w-full gap-2 sm:w-auto">
                    <button
                      onClick={() => setEditing(p)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-3 py-2 text-xs font-semibold sm:w-auto"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("editBtn")}
                    </button>
                    <button
                      onClick={() => setDeleting(p)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 sm:w-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("deleteBtn")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ===== Payouts History (compact) ===== */}
      <div className="mt-4 rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-2 text-sm font-semibold">{t("recentPayoutsTitle")}</div>
        {listLoading ? (
          <ListSkeleton />
        ) : payouts.length === 0 ? (
          <EmptyState
            title={t("recentPayoutsEmptyTitle")}
            desc={t("recentPayoutsEmptyDesc")}
          />
        ) : (
          <ul className="divide-y">
            {payouts.slice(0, 8).map((p) => (
              <PayoutRowCard key={p.id} row={p} />
            ))}
          </ul>
        )}
        <a
          href="/influencer/payouts"
          className="mt-3 inline-block text-xs font-medium text-neutral-700 underline"
        >
          {t("viewAllBtn")}
        </a>
      </div>

      {/* ===== Wallet modal (LOAD + SAVE) ===== */}
      {showWalletModal && (
        <WalletModal
          onClose={() => setShowWalletModal(false)}
          loadInitial={savedWallet}
          onSaved={(w) => {
            setSavedWallet(w);
            setWalletConnected(
              !!(w.upi_id || (w.bank?.number && w.bank?.ifsc))
            );
            setFlash(t("walletSavedToast"));
            setTimeout(() => setFlash(null), 1200);
          }}
        />
      )}

      {/* ===== Redeem (manual payout) modal ===== */}
      {showRedeemModal && (
        <Modal
          onClose={() => setShowRedeemModal(false)}
          title={t("requestModalTitle")}
        >
          <RequestManualBody
            maxAmount={statWallet}
            wallet={savedWallet}
            onOpenWallet={() => {
              setShowRedeemModal(false);
              setShowWalletModal(true);
            }}
            onClose={() => setShowRedeemModal(false)}
            onDone={async () => {
              setShowRedeemModal(false);
              setFlash(t("requestSubmittedToast"));
              await loadPayouts();
              if (token) await loadSummary(token);
            }}
          />
        </Modal>
      )}

      {/* ===== Edit / Delete promo modals ===== */}
      {editing && (
        <EditPromoModal
          promo={editing}
          cap={cap}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await loadPromos();
            setFlash("Promo updated");
          }}
        />
      )}

      {deleting && (
        <DeletePromoModal
          promo={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async () => {
            setDeleting(null);
            await loadPromos();
            setFlash("Promo deleted");
          }}
        />
      )}
    </div>
  );
}

/* ---------- Wallet Modal (GET/POST /api/me/wallet) ---------- */
function WalletModal({
  onClose,
  loadInitial,
  onSaved,
}: {
  onClose: () => void;
  loadInitial: WalletData | null;
  onSaved: (w: WalletData) => void;
}) {
  const supabase = createClientComponentClient();
  const t = useTranslations("influencer");

  // All five payout channels — influencer fills whichever applies.
  // Indian rails
  const [upiId, setUpiId] = useState(loadInitial?.upi_id || "");
  const [accName, setAccName] = useState(loadInitial?.bank?.name || "");
  const [accNo, setAccNo] = useState(loadInitial?.bank?.number || "");
  const [ifsc, setIfsc] = useState(loadInitial?.bank?.ifsc || "");
  // International bank
  const [iBankName, setIBankName] = useState(
    loadInitial?.bank_intl?.bank_name || ""
  );
  const [iAccHolder, setIAccHolder] = useState(
    loadInitial?.bank_intl?.account_holder || ""
  );
  const [iAccNo, setIAccNo] = useState(
    loadInitial?.bank_intl?.account_number || ""
  );
  const [iSwift, setISwift] = useState(loadInitial?.bank_intl?.swift_bic || "");
  const [iIban, setIIban] = useState(loadInitial?.bank_intl?.iban || "");
  const [iRouting, setIRouting] = useState(
    loadInitial?.bank_intl?.routing_number || ""
  );
  const [iBranchAddr, setIBranchAddr] = useState(
    loadInitial?.bank_intl?.branch_address || ""
  );
  // Provider rails
  const [paypalEmail, setPaypalEmail] = useState(loadInitial?.paypal_email || "");
  const [wiseEmail, setWiseEmail] = useState(loadInitial?.wise_email || "");
  // Preferred method hint
  const [preferred, setPreferred] = useState<NonNullable<WalletData["preferred_method"]> | "">(
    loadInitial?.preferred_method ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const token = await clientAuthToken();
    if (!token) {
      setError(t("errSignInAgain"));
      return;
    }

    // Build the full multi-method payload. Empty strings → null so
    // the server's "did you start filling this channel" check works.
    const payload: WalletData = {
      upi_id: upiId.trim() || null,
      bank:
        accName.trim() || accNo.trim() || ifsc.trim()
          ? {
              name: accName.trim() || null,
              number: accNo.trim() || null,
              ifsc: ifsc.trim() || null,
            }
          : null,
      bank_intl:
        iBankName.trim() ||
        iAccHolder.trim() ||
        iAccNo.trim() ||
        iSwift.trim() ||
        iIban.trim() ||
        iRouting.trim() ||
        iBranchAddr.trim()
          ? {
              bank_name: iBankName.trim() || null,
              account_holder: iAccHolder.trim() || null,
              account_number: iAccNo.trim() || null,
              swift_bic: iSwift.trim() || null,
              iban: iIban.trim() || null,
              routing_number: iRouting.trim() || null,
              branch_address: iBranchAddr.trim() || null,
            }
          : null,
      paypal_email: paypalEmail.trim() || null,
      wise_email: wiseEmail.trim() || null,
      preferred_method: preferred || null,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/me/wallet", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        setError(j?.error || t("errPromoSavingTitle"));
        return;
      }
      onSaved(payload);
      onClose();
    } catch (e: any) {
      setError(e?.message || t("errPromoSavingTitle"));
    } finally {
      setSaving(false);
    }
  };

  // Tiny presentational helper to keep each method's section visually
  // grouped without nesting more components.
  const Section = ({
    title,
    desc,
    children,
  }: {
    title: string;
    desc?: string;
    children: React.ReactNode;
  }) => (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-2">
        <div className="text-sm font-semibold">{title}</div>
        {desc && (
          <p className="text-[11px] text-neutral-600 mt-0.5">{desc}</p>
        )}
      </div>
      {children}
    </div>
  );

  return (
    <Modal title={t("walletModalTitle")} onClose={onClose}>
      <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto pr-1">
        <p className="text-xs text-neutral-600">
          {t("walletModalIntro")}
        </p>

        <Section title={t("walletUpiTitle")} desc={t("walletUpiDesc")}>
          <label className="text-xs font-medium">{t("walletUpiLabel")}</label>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder={t("walletUpiPlaceholder")}
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
          />
        </Section>

        <Section title={t("walletBankTitle")} desc={t("walletBankDesc")}>
          <div>
            <label className="text-xs font-medium">{t("walletBankNameLabel")}</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <label className="text-xs font-medium">{t("walletBankNumberLabel")}</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={accNo}
                onChange={(e) => setAccNo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t("walletBankIfscLabel")}</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value)}
              />
            </div>
          </div>
        </Section>

        <Section
          title={t("walletBankIntlTitle")}
          desc={t("walletBankIntlDesc")}
        >
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-xs font-medium">{t("walletBankIntlNameLabel")}</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={iBankName}
                onChange={(e) => setIBankName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t("walletBankIntlHolderLabel")}</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={iAccHolder}
                onChange={(e) => setIAccHolder(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t("walletBankIntlNumberLabel")}</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={iAccNo}
                onChange={(e) => setIAccNo(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium">{t("walletBankIntlSwiftLabel")}</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={iSwift}
                  onChange={(e) => setISwift(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">{t("walletBankIntlIbanLabel")}</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={iIban}
                  onChange={(e) => setIIban(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">
                {t("walletBankIntlRoutingLabel")}
              </label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={iRouting}
                onChange={(e) => setIRouting(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium">{t("walletBankIntlBranchLabel")}</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={iBranchAddr}
                onChange={(e) => setIBranchAddr(e.target.value)}
              />
            </div>
          </div>
        </Section>

        <Section title={t("walletPaypalTitle")} desc={t("walletPaypalDesc")}>
          <label className="text-xs font-medium">{t("walletPaypalLabel")}</label>
          <input
            type="email"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder={t("walletPaypalPlaceholder")}
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
          />
        </Section>

        <Section title={t("walletWiseTitle")} desc={t("walletWiseDesc")}>
          <label className="text-xs font-medium">{t("walletWiseLabel")}</label>
          <input
            type="email"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder={t("walletWisePlaceholder")}
            value={wiseEmail}
            onChange={(e) => setWiseEmail(e.target.value)}
          />
        </Section>

        <Section
          title={t("walletPreferredTitle")}
          desc={t("walletPreferredDesc")}
        >
          <select
            className="mt-1 w-full rounded-lg border px-3 py-2 bg-white"
            value={preferred}
            onChange={(e) =>
              setPreferred(
                e.target.value as NonNullable<WalletData["preferred_method"]> | ""
              )
            }
          >
            <option value="">{t("walletPreferredNoPref")}</option>
            <option value="upi">{t("walletPreferredUpi")}</option>
            <option value="bank">{t("walletPreferredBank")}</option>
            <option value="bank_intl">{t("walletPreferredBankIntl")}</option>
            <option value="paypal">{t("walletPreferredPaypal")}</option>
            <option value="wise">{t("walletPreferredWise")}</option>
          </select>
        </Section>

        {error && (
          <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <button
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-4 py-2 font-semibold"
          >
            <X className="h-4 w-4" /> {t("cancelBtn")}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {t("saveBtn")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Row Card (payout) ---------- */
function PayoutRowCard({ row }: { row: PayoutRow }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("influencer");

  const badge = {
    initiated: { text: t("statusPending"), cls: "bg-amber-50 text-amber-700" },
    processing: { text: t("statusProcessing"), cls: "bg-sky-50 text-sky-700" },
    paid: { text: t("statusSettled"), cls: "bg-emerald-50 text-emerald-700" },
    failed: { text: t("statusFailedLabel"), cls: "bg-red-50 text-red-700" },
    canceled: { text: t("statusFailedLabel"), cls: "bg-neutral-100 text-neutral-700" },
  }[row.status];

  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">
              {toINR(row.amount, row.currency)}
            </span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${badge.cls}`}
            >
              {badge.text}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-neutral-600">
            {new Date(row.created_at).toLocaleString()}
            {row.status === "paid" && row.paid_at
              ? ` • ${t("paidLabel")} ${new Date(row.paid_at).toLocaleString()}`
              : ""}
            {row.notes ? ` • ${row.notes}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {row.covering_orders && row.covering_orders.length > 0 && (
            <button
              className="inline-flex items-center gap-1 rounded-lg border bg-neutral-50 px-3 py-1.5 text-xs"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {t("ordersBtn", { count: row.covering_orders.length })}
            </button>
          )}
        </div>
      </div>

      {open && row.covering_orders && (
        <div className="mt-2 rounded-lg border bg-neutral-50 p-2 text-xs">
          <div className="mb-1 font-medium">{t("coveringOrdersTitle")}</div>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {row.covering_orders.map((oid) => (
              <li key={oid} className="truncate">
                {t("orderLine", { id: oid })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

/* ---------- Modal shell ---------- */
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const t = useTranslations("influencer");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button
            className="rounded p-1 hover:bg-neutral-100"
            onClick={onClose}
            aria-label={t("modalCloseAria")}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Manual Request Body ---------- */
//
// Payout request modal. Mirrors the five channels supported by
// WalletModal (UPI, Indian bank, international bank, PayPal, Wise)
// instead of asking the influencer to retype details — anything they
// already saved in the wallet is preselected and the admin sees the
// full snapshot in `payout_meta`. If the influencer hasn't saved any
// methods yet, we route them to the wallet rather than collecting
// duplicate data here.
type PayoutChannel = "upi" | "bank" | "bank_intl" | "paypal" | "wise";

function channelLabel(c: PayoutChannel, t: (k: string) => string): string {
  switch (c) {
    case "upi": return t("channelLabelUpi");
    case "bank": return t("channelLabelBank");
    case "bank_intl": return t("channelLabelBankIntl");
    case "paypal": return t("channelLabelPaypal");
    case "wise": return t("channelLabelWise");
  }
}

function channelHint(c: PayoutChannel, t: (k: string) => string): string {
  switch (c) {
    case "upi": return t("channelHintUpi");
    case "bank": return t("channelHintBank");
    case "bank_intl": return t("channelHintBankIntl");
    case "paypal": return t("channelHintPaypal");
    case "wise": return t("channelHintWise");
  }
}

function walletChannelPopulated(w: WalletData | null, c: PayoutChannel): boolean {
  if (!w) return false;
  switch (c) {
    case "upi": return !!w.upi_id;
    case "bank": return !!(w.bank?.number && w.bank?.ifsc);
    case "bank_intl": return !!(w.bank_intl?.account_number && (w.bank_intl?.swift_bic || w.bank_intl?.iban));
    case "paypal": return !!w.paypal_email;
    case "wise": return !!w.wise_email;
  }
}

function channelSnapshot(w: WalletData | null, c: PayoutChannel): Record<string, any> | null {
  if (!w) return null;
  switch (c) {
    case "upi": return { upi_id: w.upi_id ?? null };
    case "bank": return { bank: w.bank ?? null };
    case "bank_intl": return { bank_intl: w.bank_intl ?? null };
    case "paypal": return { paypal_email: w.paypal_email ?? null };
    case "wise": return { wise_email: w.wise_email ?? null };
  }
}

function channelSummary(w: WalletData | null, c: PayoutChannel, emDash: string): string {
  if (!w) return emDash;
  const last4 = (s?: string | null) =>
    !s ? "" : "•••• " + s.slice(-4);
  switch (c) {
    case "upi": return w.upi_id || emDash;
    case "bank":
      return [w.bank?.name, last4(w.bank?.number), w.bank?.ifsc]
        .filter(Boolean).join(" · ") || emDash;
    case "bank_intl":
      return [
        w.bank_intl?.bank_name,
        w.bank_intl?.account_holder,
        last4(w.bank_intl?.account_number),
        w.bank_intl?.swift_bic || w.bank_intl?.iban,
      ].filter(Boolean).join(" · ") || emDash;
    case "paypal": return w.paypal_email || emDash;
    case "wise": return w.wise_email || emDash;
  }
}

function RequestManualBody({
  maxAmount,
  wallet,
  onOpenWallet,
  onClose,
  onDone,
}: {
  maxAmount: number;
  wallet: WalletData | null;
  onOpenWallet: () => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClientComponentClient();

  // Visitor currency for input. Influencer types the amount in their
  // local currency (UX choice — pick "$50" easier than "₹4,200");
  // on submit we convert to INR for storage. The commission ledger
  // is INR-only so the source of truth never drifts.
  const { isINR, formatPrice, currency, rate } = useCurrency();
  const t = useTranslations("influencer");
  const fxRate = rate?.rate_from_inr || 1; // units of local per 1 INR

  // Local-currency max (derived from the INR maxAmount). For INR
  // visitors this is just maxAmount itself.
  const maxLocal = isINR ? maxAmount : maxAmount * fxRate;

  // Slider step. Whole-rupee step locked the user out of the
  // fractional tail (e.g. balance ₹52.50 maxed at ₹52). Scale step
  // to magnitude — small balances get 0.01 precision so the slider
  // can land on the exact maximum, big balances get coarser steps
  // so the track doesn't have 50,000 positions for a ₹50k balance.
  const computeStep = (max: number) => {
    if (max <= 100) return 0.01;
    if (max <= 1000) return 1;
    if (max <= 10000) return 10;
    return 100;
  };
  // Round a slider value to the step grid + clamp to [0, max] — keeps
  // the value clean (no 52.49999998) and prevents tiny FP drift from
  // pushing the user above maxLocal when they hit "Max".
  const snapToStep = (value: number, max: number, st: number) => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (value >= max) return max;
    const snapped = Math.round(value / st) * st;
    // Use the step's decimal count to round cleanly so we don't end
    // up with 1.5000000000000002 in the input.
    const decimals = st < 1 ? Math.max(0, -Math.floor(Math.log10(st))) : 0;
    return Number(Math.min(max, Math.max(0, snapped)).toFixed(decimals));
  };
  const [amountLocal, setAmountLocal] = useState<number>(maxLocal || 0);
  const [step, setStep] = useState<number>(computeStep(maxLocal));
  useEffect(() => {
    const nextStep = computeStep(maxLocal);
    setStep(nextStep);
    // Default to the full max — most payouts withdraw everything,
    // and the user can drag down from there.
    setAmountLocal(snapToStep(maxLocal, maxLocal, nextStep));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxAmount, currency]);

  // INR equivalent — what we actually store on the request. For INR
  // visitors this equals amountLocal; for non-INR it's the back-
  // conversion using the live FX rate.
  const amountInr = isINR ? amountLocal : amountLocal / (fxRate || 1);

  // All five channels in display order. We only render the ones the
  // influencer has actually populated in their wallet — this modal is
  // a "pick which saved method to use", not a re-entry form.
  const ALL_CHANNELS: PayoutChannel[] = ["upi", "bank", "bank_intl", "paypal", "wise"];
  const availableChannels = ALL_CHANNELS.filter((c) => walletChannelPopulated(wallet, c));
  const hasAnyMethod = availableChannels.length > 0;

  // Default to the influencer's preferred method when it's populated;
  // otherwise the first populated channel.
  const preferred = wallet?.preferred_method ?? null;
  const initialChannel: PayoutChannel | null =
    (preferred && walletChannelPopulated(wallet, preferred) ? preferred : null) ??
    availableChannels[0] ??
    null;

  const [channel, setChannel] = useState<PayoutChannel | null>(initialChannel);
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!hasAnyMethod || !channel) {
      setErr(t("errAddPayoutMethod"));
      return;
    }
    if (!walletChannelPopulated(wallet, channel)) {
      setErr(t("errChannelNotPopulated"));
      return;
    }
    if (!(amountInr > 0)) {
      setErr(t("errAmountGreaterThanZero"));
      return;
    }
    if (amountInr > maxAmount + 0.0001) {
      setErr(t("errAmountAboveBalance", { max: toINR(maxAmount) }));
      return;
    }

    setSaving(true);
    const token = await clientAuthToken();
    if (!token) {
      setSaving(false);
      setErr(t("errSignInAgain"));
      return;
    }

    // Snapshot the selected channel's details from the wallet so admin
    // sees exactly what was saved at request time — protects against
    // later wallet edits changing the meaning of an already-pending row.
    const details = {
      payment_channel: channel,
      ...(channelSnapshot(wallet, channel) ?? {}),
      contact: contact || null,
      user_note: note || null,
    };
    const request_note = `manual_payout | ${JSON.stringify(details)}`;

    const res = await fetch("/api/me/payouts/request", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({
        method: "manual",
        // Always submit INR — the wallet ledger is INR-canonical even
        // when the influencer typed in their local currency.
        amount: Number(amountInr),
        contact_email: contact || null,
        request_note,
      }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok || j?.ok === false) {
      setErr(j?.error || t("errSubmitFailed"));
      return;
    }
    onDone();
  };

  const canSubmit = maxAmount > 0 && !saving && hasAnyMethod && !!channel;

  return (
    <div className="space-y-4 text-sm">
      {maxAmount <= 0 && (
        <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
          {t("noBalanceMessage")}
        </div>
      )}

      <div className="rounded-lg border bg-neutral-50 p-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{t("withdrawAmountLabel")}</div>
          <div className="text-sm font-bold">
            {isINR ? toINR(amountLocal) : formatPrice(amountInr)}
          </div>
        </div>
        <input
          type="range"
          className="mt-3 w-full"
          min={0}
          max={maxLocal}
          step={step}
          value={amountLocal}
          disabled={maxAmount <= 0}
          onChange={(e) =>
            setAmountLocal(snapToStep(Number(e.target.value), maxLocal, step))
          }
        />
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={maxLocal}
            step={step}
            className="w-28 rounded-lg border px-3 py-2"
            value={amountLocal}
            disabled={maxAmount <= 0}
            onChange={(e) =>
              setAmountLocal(snapToStep(Number(e.target.value), maxLocal, step))
            }
          />
          {/* "Max" shortcut — sets the slider to the exact balance.
              Important when the balance is fractional (e.g. ₹52.50)
              and the step grid doesn't land exactly on it. */}
          <button
            type="button"
            onClick={() => setAmountLocal(maxLocal)}
            disabled={maxAmount <= 0}
            className="rounded-lg border bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("maxBtn")}
          </button>
          <div className="text-[11px] text-neutral-600 ml-auto">
            {t("payoutAvailableLabel", {
              amount: isINR ? toINR(maxAmount) : formatPrice(maxAmount),
            })}
          </div>
        </div>
        {!isINR && (
          <p className="mt-2 text-[11px] text-neutral-500">
            {t("walletCreditNote", { amount: toINR(amountInr) })}
          </p>
        )}
      </div>

      {!hasAnyMethod ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="font-semibold mb-1">{t("noMethodsTitle")}</div>
          <div className="mb-2">
            {t("noMethodsDesc")}
          </div>
          <button
            type="button"
            onClick={onOpenWallet}
            className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white"
          >
            {t("openWalletBtn")}
          </button>
        </div>
      ) : (
        <>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium">{t("payMeViaLabel")}</label>
              <button
                type="button"
                onClick={onOpenWallet}
                className="text-[11px] text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
              >
                {t("editMethodsLink")}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {availableChannels.map((c) => {
                const selected = channel === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={`rounded-xl border px-3 py-2 text-left ${
                      selected
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "bg-neutral-50 hover:bg-neutral-100"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{channelLabel(c, t)}</span>
                      {preferred === c && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                          {t("preferredBadge")}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-600">
                      {channelHint(c, t)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {channel && (
            <div className="rounded-lg border bg-white p-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                {t("channelDetailsLabel", { channel: channelLabel(channel, t) })}
              </div>
              <div className="mt-1 break-all text-sm text-neutral-800">
                {channelSummary(wallet, channel, t("emDash"))}
              </div>
              <div className="mt-2 text-[11px] text-neutral-500">
                {t("channelDetailsNote")}
              </div>
            </div>
          )}
        </>
      )}

      <div className="space-y-2 text-xs text-neutral-700">
        <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <div>
            {t("requestPendingHelp")}
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          onClick={onClose}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-4 py-2 font-semibold"
        >
          <X className="h-4 w-4" /> {t("closeBtn")}
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {t("payoutRequest")}
        </button>
      </div>
    </div>
  );
}

/* ---------- Edit & Delete Promo Modals ---------- */
function EditPromoModal({
  promo,
  cap,
  onClose,
  onSaved,
}: {
  promo: PromoRow;
  cap: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClientComponentClient();
  const t = useTranslations("influencer");

  const [form, setForm] = useState({
    active: promo.active,
    discount_percent: promo.discount_percent,
    commission_percent: promo.commission_percent,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sum = useMemo(
    () =>
      Number(form.discount_percent || 0) + Number(form.commission_percent || 0),
    [form]
  );

  const save = async () => {
    setSaving(true);
    setError(null);
    const token = await clientAuthToken();
    if (!token) {
      setSaving(false);
      setError(t("errSignInAgain"));
      return;
    }

    if (form.discount_percent < 0 || form.discount_percent > cap) {
      setSaving(false);
      setError(t("errPromoBetween", { max: cap }));
      return;
    }

    const autoComm = Math.max(
      0,
      cap - Number(form.discount_percent || 0)
    );

    const res = await fetch(
      `/api/influencer/promos/${encodeURIComponent(promo.id)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          active: !!form.active,
          discount_percent: Number(form.discount_percent),
          commission_percent: autoComm,
          user_discount_pct: Number(form.discount_percent),
          commission_pct: autoComm,
        }),
      }
    );
    const j = await res.json().catch(() => ({}));

    setSaving(false);
    if (!res.ok || j?.ok === false) {
      let message: string;
      if (j?.code === "SETTINGS_NOT_FINALIZED") {
        message = t("errSettingsNotFinalized");
      } else if (j?.code === "SPLIT_EXCEEDS_CAP") {
        message = t("errSplitExceedsCap", { cap: Number(j?.cap ?? cap) });
      } else {
        message = j?.error || t("errFailedSave");
      }
      setError(message);
      return;
    }
    onSaved();
  };

  return (
    <Modal title={t("editPromoTitleShort", { code: promo.code })} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="flex items-center justify-between rounded-lg border bg-neutral-50 px-3 py-2">
          <span>{t("activeLabel")}</span>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.active}
            onChange={(e) =>
              setForm((f) => ({ ...f, active: e.target.checked }))
            }
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium">{t("promoCustomerPctShort")}</label>
            <input
              type="number"
              min={0}
              max={cap}
              step="0.5"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={form.discount_percent}
              onChange={(e) => {
                const raw = Number(e.target.value);
                let value = Number.isNaN(raw) ? 0 : raw;
                if (value < 0) value = 0;
                if (value > cap) value = cap;
                const autoComm = cap - value;
                setForm((f) => ({
                  ...f,
                  discount_percent: value,
                  commission_percent: autoComm,
                }));
                setError(null);
              }}
            />
          </div>
          <div>
            <label className="text-xs font-medium">{t("promoYouPctShort")}</label>
            <input
              type="number"
              min={0}
              max={cap}
              step="0.5"
              className="mt-1 w-full rounded-lg border px-3 py-2 bg-neutral-50"
              value={form.commission_percent}
              disabled
              readOnly
            />
            <p className="mt-1 text-[11px] text-neutral-600">
              {t("yourCommissionAutoNote", { max: cap })}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-neutral-600">
          {t("splitTotalNote", { sum, cap })}
        </p>

        {error && (
          <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <button
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-4 py-2 font-semibold"
          >
            <X className="h-4 w-4" /> {t("cancelBtn")}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {t("saveBtn")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeletePromoModal({
  promo,
  onClose,
  onDeleted,
}: {
  promo: PromoRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClientComponentClient();
  const t = useTranslations("influencer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const token = await clientAuthToken();
    if (!token) {
      setBusy(false);
      setError(t("errSignInAgain"));
      return;
    }

    const res = await fetch(
      `/api/influencer/promos/${encodeURIComponent(promo.id)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      }
    );
    const j = await res.json().catch(() => ({}));

    setBusy(false);
    if (!res.ok || j?.ok === false) {
      setError(j?.error || t("errFailedDelete"));
      return;
    }
    onDeleted();
  };

  return (
    <Modal title={t("deletePromoModalTitle")} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p>
          {t("deletePromoConfirmShort", { code: promo.code })}
        </p>
        {error && (
          <div className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <button
            onClick={onClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-neutral-50 px-4 py-2 font-semibold"
          >
            <X className="h-4 w-4" /> {t("cancelBtn")}
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("deleteBtn")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Small atoms ---------- */
function StatCard({
  loading,
  icon,
  label,
  value,
  subValue,
}: {
  loading: boolean;
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Optional caption shown under the headline. Used for the INR
   *  reference under a local-currency headline in non-INR sessions. */
  subValue?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-neutral-700">
        <div className="rounded-lg bg-neutral-50 p-2">{icon}</div>
        <div className="text-xs">{label}</div>
      </div>
      <div className="mt-2 text-lg font-bold">
        {loading ? (
          <span className="inline-block h-5 w-24 animate-pulse rounded bg-neutral-100" />
        ) : (
          value
        )}
      </div>
      {!loading && subValue && (
        <div className="mt-0.5 text-xs text-neutral-500 tabular-nums">
          {subValue}
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border bg-neutral-50 p-4 text-center">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs text-neutral-600">{desc}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-neutral-100" />
            <div>
              <div className="mb-1 h-3 w-36 animate-pulse rounded bg-neutral-100" />
              <div className="h-2 w-24 animate-pulse rounded bg-neutral-100" />
            </div>
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-neutral-100" />
        </li>
      ))}
    </ul>
  );
}

function toINR(n: number, currency?: string | null) {
  const code = (currency || "INR").toUpperCase();
  // Auto-decide decimals: whole values stay clean ("₹1,000"); anything
  // with a fractional tail keeps two decimals so the payout slider's
  // exact-balance display reads correctly ("₹52.50", not "₹52").
  const hasFraction = Math.abs(n - Math.round(n)) > 1e-9;
  const decimals = hasFraction ? 2 : 0;
  try {
    return n.toLocaleString("en-IN", {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return `${code === "INR" ? "₹" : code + " "}${n.toFixed(decimals)}`;
  }
}
