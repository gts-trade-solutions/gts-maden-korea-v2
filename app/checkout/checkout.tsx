"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/contexts/CartContext";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { useCountry } from "@/lib/contexts/CountryContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import { COUNTRY_PROFILES } from "@/lib/countries";
import { toast } from "sonner";
// supabase (anon) is still used for PUBLIC reads only (published products) — those
// work under both backends. All user-scoped reads/writes go through API routes.
import { supabase } from "@/lib/supabaseClient";
import { useRazorpayCheckout } from "@/lib/hooks/useRazorpayCheckout";
import {
  computeShippingFee,
  shippingMessage,
  hasActiveMembership,
  type MembershipRow,
} from "@/lib/membership";
import { useShippingConfig } from "@/lib/hooks/useShippingConfig";
import { trackEvent } from "@/lib/analytics/track";

type DbProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  hero_image_path?: string | null;
  brands?: { name?: string | null } | null;
};

type ViewLine = {
  productId: string;
  name: string;
  brand?: string | null;
  qty: number;
  currency?: string | null;
  unitPrice: number;
  unitMrpToShow?: number | null;
  lineTotal: number;
};

type CalcTotals = {
  currency: string;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  sale_savings?: number;
  allocations?: Record<string, number>;
  applied: null | {
    type: "promo" | "referral";
    code?: string;
    product_id?: string | null;
    discount_percent?: number;
  };
  // International slab-pricing metadata — null for India orders.
  shipping_slab?: null | {
    effective_weight_g: number;
    current_slab_label: string;
    current_slab_cutoff_g: number;
    remaining_in_slab_g: number;
    is_max_slab: boolean;
    next_slab_label: string | null;
    next_slab_fee_inr: number | null;
    next_slab_delta_inr: number | null;
  };
};

// Drives the "you can add ~N more before tier change" hint.
function formatWeight(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) return "0g";
  if (grams < 1000) return `${Math.round(grams)}g`;
  const kg = grams / 1000;
  const fixed = kg.toFixed(1).replace(/\.0$/, "");
  return `${fixed} kg`;
}

function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && isNaN(s.getTime())) return false;
  if (e && isNaN(e.getTime())) return false;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function effectiveUnitPrice(p: DbProduct) {
  const saleOk =
    p.sale_price != null && isSaleActive(p.sale_starts_at, p.sale_ends_at);
  return saleOk && p.sale_price != null ? p.sale_price : p.price ?? 0;
}

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return "";
  const code = (currency ?? "INR").toUpperCase();
  if (code === "INR") return `₹${v.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(v);
  } catch {
    return `${code} ${v.toLocaleString()}`;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("checkoutPage");
  const debug = params.get("debug") === "1";

  const { items } = useCart();
  const { isAuthenticated, ready, user } = useAuth();
  const { formatPrice, isINR, currency } = useCurrency();
  const { country, profile: countryProfile } = useCountry();
  const { start } = useRazorpayCheckout();
  const shippingConfig = useShippingConfig();

  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [dbProducts, setDbProducts] = useState<Record<string, DbProduct>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [calc, setCalc] = useState<CalcTotals | null>(null);
  const [loadingTotals, setLoadingTotals] = useState(false);
  // Surfaces structured errors from /api/checkout/calc-totals so the
  // order summary doesn't stay forever-loading when the API can't price
  // the cart (e.g. international visitor's country has no rate, or a
  // product in the cart is missing net_weight_g).
  const [calcError, setCalcError] = useState<{
    code: string;
    productId?: string;
    maxKg?: number;
    effectiveKg?: number;
  } | null>(null);
  const [membership, setMembership] = useState<MembershipRow | null>(null);

  const totalsSeq = useRef(0);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    line2: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [addressLoaded, setAddressLoaded] = useState(false);

  // Delivery ETA — refreshes when the destination country or (for
  // India) the entered pincode changes. India uses the pincode to
  // resolve a zone-specific window; international uses the country's
  // configured range. The fetch is debounced via the dependency list,
  // not a timer, because country/pincode changes are infrequent.
  const [eta, setEta] = useState<{ min: number; max: number } | null>(null);

  // Saved-address picker state. `savedAddresses` is the full list for
  // the radio cards; `selectedAddressId` tracks which (if any) is
  // currently filling the form. Picking a saved address clears the
  // "save this address" toggle by default — we don't want to insert
  // a duplicate row.
  type SavedAddressRow = {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    state: string | null;
    pincode: string;
    country: string;
    is_default: boolean;
  };
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressRow[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null
  );

  // Explicit "Save this address" toggle. Replaces the previous
  // silent-overwrite-default behaviour (which destroyed the user's
  // saved address every checkout). Defaults to ON if the user has no
  // saved addresses yet — so first-time customers don't lose their
  // address — and OFF when they already have at least one.
  const [saveThisAddress, setSaveThisAddress] = useState(false);
  const [makeDefaultOnSave, setMakeDefaultOnSave] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) router.replace("/auth/login?redirect=/checkout");
  }, [ready, isAuthenticated, router]);

  const checkoutStartedFiredRef = useRef(false);
  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    if (items.length === 0) return;
    if (checkoutStartedFiredRef.current) return;
    checkoutStartedFiredRef.current = true;
    trackEvent("checkout_started", { item_count: items.length });
  }, [ready, isAuthenticated, items.length]);

  useEffect(() => {
    if (items.length === 0 && ready && isAuthenticated) {
      try {
        if (typeof window !== "undefined") {
          const isRedirectingToSuccess =
            sessionStorage.getItem("payment_success_redirecting") === "1";
          if (isRedirectingToSuccess) return;
        }
      } catch {}
      router.push("/cart");
    }
  }, [items.length, ready, isAuthenticated, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadMembership() {
      try {
        // Backend-aware: server resolves the user from the session (Supabase or
        // NextAuth). Avoids the browser supabase.auth call that fails post-flip.
        const res = await fetch("/api/me/membership", { credentials: "include", cache: "no-store" });
        const j = res.ok ? await res.json() : {};
        if (!cancelled) setMembership((j?.membership as MembershipRow | null) ?? null);
      } catch (error) {
        console.error("Checkout membership load error:", error);
        if (!cancelled) setMembership(null);
      }
    }

    if (ready && isAuthenticated) loadMembership();

    return () => {
      cancelled = true;
    };
  }, [ready, isAuthenticated]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (items.length === 0) return;
      setLoadingProducts(true);

      const ids = Array.from(new Set(items.map((i) => i.product_id)));

      const { data, error } = await supabase
        .from("products")
        .select(
          `
          id, slug, name,
          price, currency,
          compare_at_price, sale_price, sale_starts_at, sale_ends_at,
          hero_image_path,
          brands ( name )
        `
        )
        .in("id", ids)
        .eq("is_published", true);

      if (cancelled) return;

      if (error) {
        console.error("Load products @ checkout:", error);
        toast.error(t("errLoadProducts"));
        setDbProducts({});
      } else {
        const map: Record<string, DbProduct> = {};
        (data ?? []).forEach((p) => {
          map[p.id] = p as DbProduct;
        });
        setDbProducts(map);
      }

      setLoadingProducts(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [items]);

  const lines: ViewLine[] = useMemo(() => {
    return items.map((it) => {
      const p = dbProducts[it.product_id];

      if (!p) {
        return {
          productId: it.product_id,
          name: "Product",
          qty: it.quantity,
          unitPrice: 0,
          lineTotal: 0,
          currency: "INR",
        };
      }

      const unit = effectiveUnitPrice(p);
      const mrpToShow =
        p.compare_at_price != null && p.compare_at_price > unit
          ? p.compare_at_price
          : null;

      return {
        productId: p.id,
        name: p.name,
        brand: p.brands?.name ?? null,
        qty: it.quantity,
        currency: p.currency ?? "INR",
        unitPrice: unit,
        unitMrpToShow: mrpToShow,
        lineTotal: unit * it.quantity,
      };
    });
  }, [items, dbProducts]);

  const localSubtotal = useMemo(
    () => lines.reduce((acc, l) => acc + l.lineTotal, 0),
    [lines]
  );

  const shippingCost = computeShippingFee(localSubtotal, membership, shippingConfig);
  const membershipActive = hasActiveMembership(membership);

  const askTotals = async (reason: string) => {
    if (items.length === 0) return;
    const mySeq = ++totalsSeq.current;

    setLoadingTotals(true);
    setCalc(null);
    setCalcError(null);

    const payload = {
      lines: items.map((i) => ({ product_id: i.product_id, qty: i.quantity })),
      shippingFee: shippingCost,
      explain: debug,
    };

    console.log(`[TOTALS][${mySeq}] -> POST /api/checkout/calc-totals`, {
      reason,
      payload,
    });

    try {
      const res = await fetch("/api/checkout/calc-totals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => ({}));
      console.log(`[TOTALS][${mySeq}] <-`, res.status, j);

      if (mySeq === totalsSeq.current) {
        if (res.ok && typeof j?.total === "number") {
          setCalc(j as CalcTotals);
        } else {
          setCalc(null);
          setCalcError({
            code: j?.error || "CALC_FAILED",
            productId: j?.product_id,
            maxKg: j?.maxKg,
            effectiveKg: j?.effectiveKg,
          });
        }
      } else {
        console.log(`[TOTALS][${mySeq}] (stale) ignored`);
      }
    } catch (err) {
      console.warn(`[TOTALS][${mySeq}] error`, err);
      if (mySeq === totalsSeq.current) {
        setCalc(null);
        setCalcError({ code: "CALC_FAILED" });
      }
    } finally {
      if (mySeq === totalsSeq.current) setLoadingTotals(false);
    }
  };

  useEffect(() => {
    askTotals("mount/dep-change");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, shippingCost]);

  // Delivery ETA fetcher. Re-runs whenever the destination country
  // changes, or — for Indian addresses only — when the customer
  // finishes typing a 6-digit pincode (so we can narrow to a zone).
  useEffect(() => {
    let cancelled = false;
    const validIndianPincode = /^\d{6}$/.test(formData.pincode);
    const qs = new URLSearchParams({ country });
    if (country === "IN" && validIndianPincode) {
      qs.set("pincode", formData.pincode);
    }
    (async () => {
      try {
        const res = await fetch(`/api/shipping/eta?${qs.toString()}`, {
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body?.ok && body.eta) {
          setEta({ min: body.eta.min, max: body.eta.max });
        } else {
          setEta(null);
        }
      } catch {
        if (!cancelled) setEta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [country, formData.pincode]);

  const recalcNow = () => askTotals("manual-debug-recalc");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "phone") {
      setFormData({ ...formData, phone: value.replace(/\D/g, "").slice(0, 10) });
      return;
    }
    if (name === "pincode") {
      setFormData({ ...formData, pincode: value.replace(/\D/g, "").slice(0, 6) });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  useEffect(() => {
    if (!ready || !isAuthenticated || addressLoaded) return;

    (async () => {
      // Backend-aware: saved addresses + profile come from the account API routes
      // (work under Supabase AND NextAuth; the server resolves the user from the
      // session). The browser supabase.auth path failed post-flip.
      const [addrJson, profJson] = await Promise.all([
        fetch("/api/account/addresses", { credentials: "include", cache: "no-store" })
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
        fetch("/api/account/profile", { credentials: "include", cache: "no-store" })
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
      ]);

      const rows = ((addrJson as any)?.addresses ?? []) as SavedAddressRow[];
      setSavedAddresses(rows);

      const defaultAddr = rows.find((a) => a.is_default) ?? rows[0] ?? null;
      const profile = ((profJson as any)?.profile ?? null) as { full_name?: string | null; phone?: string | null } | null;

      setFormData((prev) => ({
        ...prev,
        name: prev.name || defaultAddr?.name || profile?.full_name || "",
        email: prev.email || defaultAddr?.email || user?.email || "",
        phone: prev.phone || defaultAddr?.phone || profile?.phone || "",
        address: prev.address || defaultAddr?.line1 || "",
        line2: prev.line2 || defaultAddr?.line2 || "",
        landmark: prev.landmark || defaultAddr?.landmark || "",
        city: prev.city || defaultAddr?.city || "",
        state: prev.state || defaultAddr?.state || "",
        pincode: prev.pincode || defaultAddr?.pincode || "",
      }));
      if (defaultAddr) setSelectedAddressId(defaultAddr.id);

      // First-time customers (no saved addresses) get the "save this
      // address" checkbox pre-ticked so the convenience is opt-out, not
      // opt-in. Returning customers default to OFF — they already have
      // saved addresses and probably don't want a duplicate row.
      setSaveThisAddress(rows.length === 0);

      setAddressLoaded(true);
    })();
  }, [ready, isAuthenticated, addressLoaded, user?.email]);

  // Handler for picking a saved address — populates the form and
  // remembers which row was picked so we don't insert a duplicate
  // on Pay.
  const pickSavedAddress = (a: SavedAddressRow) => {
    setSelectedAddressId(a.id);
    setFormData({
      name: a.name || "",
      email: a.email || formData.email,
      phone: a.phone || "",
      address: a.line1 || "",
      line2: a.line2 || "",
      landmark: a.landmark || "",
      city: a.city || "",
      state: a.state || "",
      pincode: a.pincode || "",
    });
    // Picked a saved address ⇒ no need to save a duplicate; turn the
    // toggle off.  User can still tick it back on if they edit fields
    // and want to keep the modified version.
    setSaveThisAddress(false);
    setMakeDefaultOnSave(false);
  };

  // "Use a new address" — clears the form + selection so the user can
  // type freshly. Auto-flips the save toggle on so the new entry is
  // captured by default.
  const clearAddressSelection = () => {
    setSelectedAddressId(null);
    setFormData((prev) => ({
      ...prev,
      address: "",
      line2: "",
      landmark: "",
      city: "",
      state: "",
      pincode: "",
    }));
    setSaveThisAddress(true);
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();

    // India-specific validation: 10-digit mobile + 6-digit PIN +
    // DTDC serviceability. International addresses are freeform so
    // none of these are enforced for non-IN buyers — postal codes
    // and phone formats vary too widely to validate client-side.
    const phone = formData.phone.replace(/\D/g, "");
    const pincode = formData.pincode.replace(/\D/g, "");

    if (isINR) {
      if (!/^[6-9]\d{9}$/.test(phone)) {
        toast.error(t("errInvalidPhone"));
        return;
      }
      if (!/^\d{6}$/.test(pincode)) {
        toast.error(t("errInvalidPincode"));
        return;
      }

      // C-04: pre-payment serviceability check. Fail-open if the
      // courier check returns undetermined / errors so we don't block
      // checkout on transient failures.
      try {
        const sres = await fetch(
          `/api/dtdc/serviceability?pincode=${encodeURIComponent(pincode)}`,
          { cache: "no-store" }
        );
        const sj = (await sres.json().catch(() => null)) as {
          ok?: boolean;
          serviceable: boolean | null;
        } | null;
        if (sres.ok && sj?.ok && sj.serviceable === false) {
          toast.error(t("errUnservicedPincode", { pincode }));
          return;
        }
      } catch {
        // network error → fail open, let payment proceed
      }
    } else {
      // For international buyers we only require the basic fields the
      // form already marks as `required` — name, email, address line,
      // city, postal code, country. Empty trims through `required`
      // attributes; nothing further to validate here.
    }

    if (!calc) {
      toast.error(t("errTotalsNotReady"));
      return;
    }

    setIsProcessing(true);

    trackEvent("pay_clicked", {
      subtotal: calc.subtotal,
      shipping_fee: calc.shipping_fee,
      discount_total: calc.discount_total,
      total: calc.total,
      item_count: items.length,
      promo_code: calc.applied?.code ?? null,
    });

    // Snapshot the destination country alongside the address so the
    // order row knows where it was shipping to even if the buyer's
    // session cookie later changes. India = "India" string literal for
    // backward compatibility with India-only consumers (DTDC, etc).
    const addressSnapshot = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      pincode: formData.pincode,
      country: isINR ? "India" : countryProfile.name,
      country_code: country,
    };

    console.log(
      "[PAY][UI] subtotal:",
      calc.subtotal,
      "shipping:",
      calc.shipping_fee,
      "discount:",
      calc.discount_total,
      "TOTAL(UI):",
      calc.total
    );

    try {
      // Explicit "Save this address" toggle. The order's `address_snapshot`
      // carries the full address regardless, so fulfilment never depends on the
      // addresses table — address-save failures are warned, not fatal. Writes go
      // through the account API (backend-aware: Supabase OR NextAuth).
      if (saveThisAddress) {
        const payload = {
          name: formData.name?.trim() || null,
          phone: formData.phone?.trim() || null,
          email: formData.email?.trim() || null,
          line1: formData.address,
          line2: formData.line2?.trim() || null,
          landmark: formData.landmark?.trim() || null,
          city: formData.city,
          state: formData.state || null,
          pincode,
          // Use the full country name to match account-settings legacy
          // values (we coerce both back when reading). ISO code is on
          // the order's address_snapshot.country_code for downstream.
          country: isINR ? "India" : countryProfile.name,
          is_default: makeDefaultOnSave,
        };

        try {
          const jsonHeaders = { "content-type": "application/json" };
          let addrId = selectedAddressId;
          if (addrId) {
            await fetch(`/api/account/addresses/${addrId}`, {
              method: "PATCH", headers: jsonHeaders, credentials: "include", body: JSON.stringify(payload),
            });
          } else {
            const r = await fetch("/api/account/addresses", {
              method: "POST", headers: jsonHeaders, credentials: "include", body: JSON.stringify(payload),
            });
            const j = await r.json().catch(() => ({}));
            addrId = j?.id ?? null;
          }
          // Ensure a single default (the API's set_default clears the others).
          if (makeDefaultOnSave && addrId) {
            await fetch(`/api/account/addresses/${addrId}`, {
              method: "PATCH", headers: jsonHeaders, credentials: "include", body: JSON.stringify({ action: "set_default" }),
            });
          }
        } catch (saveErr) {
          // Don't block payment on address-save failure — the order
          // snapshot has everything fulfilment needs.
          console.warn("[CHECKOUT] address save failed:", saveErr);
        }
      }

      await start(
        addressSnapshot,
        calc?.applied ?? null,
        calc?.total ?? null,
        calc?.shipping_fee ?? shippingCost,
        () => setConfirmingPayment(true)
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (!ready) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16 text-muted-foreground">
          Loading checkout…
        </div>
      </CustomerLayout>
    );
  }

  if (!isAuthenticated || items.length === 0) return null;

  const promoText = calc?.applied?.code
    ? calc.applied.discount_percent
      ? `${calc.applied.code} • ${calc.applied.discount_percent}%`
      : calc.applied.code
    : null;

  return (
    <CustomerLayout>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />

      {confirmingPayment && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <div>
              <p className="text-lg font-semibold">{t("confirmingPayment")}</p>
              <p className="text-sm text-muted-foreground">
                Please don&apos;t close or refresh this page.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto py-8">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          {debug && (
            <button
              onClick={recalcNow}
              className="rounded border px-3 py-1 text-xs"
              type="button"
            >
              Recalculate
            </button>
          )}
        </div>

        <form onSubmit={handlePay}>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {/* Saved-address picker. Shown only when the customer
                  actually has saved addresses (returning buyers). Click
                  to autofill the form; "Use a new address" clears the
                  selection and switches save-on by default. */}
              {savedAddresses.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {t("useSavedAddressTitle")}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("useSavedAddressBody")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearAddressSelection}
                    >
                      {t("useNewAddressBtn")}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {savedAddresses.map((a) => {
                        const selected = selectedAddressId === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => pickSavedAddress(a)}
                            className={`text-left rounded-lg border p-3 hover:bg-accent transition-colors ${
                              selected
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-medium text-sm truncate">
                                {a.name || t("savedNoNameFallback")}
                              </span>
                              {a.is_default && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {t("savedDefaultBadge")}
                                </span>
                              )}
                            </div>
                            {a.phone && (
                              <p className="text-xs text-muted-foreground">
                                {a.phone}
                              </p>
                            )}
                            <p className="text-xs mt-1 text-muted-foreground line-clamp-2">
                              {a.line1}
                              {a.line2 ? `, ${a.line2}` : ""}
                              {", "}
                              {a.city}
                              {a.state ? `, ${a.state}` : ""} - {a.pincode}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {a.country}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>{t("contactHeading")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name">{t("fullNameLabel")}</Label>
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="email">{t("emailLabel")}</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">{t("phoneLabel")}</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        inputMode={isINR ? "numeric" : "tel"}
                        // India: 10-digit mobile starting 6/7/8/9.
                        // International: freeform — country code + local
                        // number, no client-side pattern enforcement.
                        pattern={isINR ? "[6-9][0-9]{9}" : undefined}
                        title={isINR ? t("phoneTooltip") : undefined}
                        maxLength={isINR ? 10 : undefined}
                        value={formData.phone}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="address">{t("addressLabel")}</Label>
                    <Input
                      id="address"
                      name="address"
                      autoComplete="street-address"
                      value={formData.address}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="city">{t("cityLabel")}</Label>
                      <Input
                        id="city"
                        name="city"
                        autoComplete="address-level2"
                        value={formData.city}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">
                        {isINR ? t("stateLabel") : t("stateOptionalLabel")}
                      </Label>
                      <Input
                        id="state"
                        name="state"
                        autoComplete="address-level1"
                        value={formData.state}
                        onChange={handleChange}
                        // State/region is mandatory for Indian addresses
                        // (it's part of the GST / GSTIN destination).
                        // Many international addresses have no state
                        // equivalent; relax to optional for non-IN.
                        required={isINR}
                      />
                    </div>
                    <div>
                      <Label htmlFor="pincode">
                        {isINR ? t("pincodeLabel") : t("postalCodeLabel")}
                      </Label>
                      <Input
                        id="pincode"
                        name="pincode"
                        value={formData.pincode}
                        onChange={handleChange}
                        autoComplete="postal-code"
                        required
                        // India = 6-digit numeric PIN. International =
                        // freeform postal code (UK alphanumerics, EU 4-5
                        // digit, etc. — we can't validate per country).
                        inputMode={isINR ? "numeric" : "text"}
                        pattern={isINR ? "\\d{6}" : undefined}
                        title={isINR ? t("pincodeTooltip") : undefined}
                        maxLength={isINR ? 6 : 16}
                      />
                    </div>
                  </div>

                  {/* Explicit save-this-address toggle. Replaces the
                      old silent overwrite of the user's default
                      address. Pre-ticked when the buyer has no saved
                      addresses yet; opt-in otherwise. */}
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={saveThisAddress}
                        onChange={(e) => {
                          setSaveThisAddress(e.target.checked);
                          if (!e.target.checked) setMakeDefaultOnSave(false);
                        }}
                        className="h-4 w-4"
                      />
                      <span>
                        {selectedAddressId
                          ? t("saveAddressUpdateLabel")
                          : t("saveAddressNewLabel")}
                      </span>
                    </label>
                    {saveThisAddress && (
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none pl-6">
                        <input
                          type="checkbox"
                          checked={makeDefaultOnSave}
                          onChange={(e) =>
                            setMakeDefaultOnSave(e.target.checked)
                          }
                          className="h-4 w-4"
                        />
                        <span className="text-muted-foreground">
                          {t("makeDefaultLabel")}
                        </span>
                      </label>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("paymentMethodHeading")}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  You’ll be redirected to the Razorpay secure checkout to
                  complete your payment.
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>{t("summaryHeading")}</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {loadingProducts && (
                      <p className="text-sm text-muted-foreground">
                        Loading items…
                      </p>
                    )}

                    {!loadingProducts &&
                      lines.map((l) => (
                        <div
                          key={l.productId}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{l.name}</div>
                            {l.brand && (
                              <div className="text-xs text-muted-foreground">
                                {l.brand}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              Qty: {l.qty}
                            </div>
                          </div>

                          <div className="text-right">
                            <div>
                              <span className="font-semibold">
                                {formatPrice(l.unitPrice)}
                              </span>
                              {l.unitMrpToShow != null && (
                                <span className="ml-2 text-muted-foreground line-through">
                                  {formatPrice(l.unitMrpToShow)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs">
                              × {l.qty} ={" "}
                              <span className="font-medium">
                                {formatPrice(l.lineTotal)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>

                  {calc?.applied && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      Promo applied{promoText ? `: ${promoText}` : ""}. Final
                      total already includes your discount.
                    </div>
                  )}

                  <Separator />

                  {/* If calc-totals returned an error, render a clear
                      explanation instead of an indefinite skeleton.
                      Pay button is disabled below until the error
                      clears. */}
                  {calcError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
                      {calcError.code === "MISSING_PRODUCT_WEIGHT" && (
                        <>
                          <strong>{t("calcMissingWeightTitle")}</strong>
                          <p className="mt-1 text-xs">
                            {t("calcMissingWeightBody")}
                          </p>
                        </>
                      )}
                      {calcError.code === "NO_SHIPPING_RATE_FOR_COUNTRY" && (
                        <>
                          <strong>{t("calcNoCountryRateTitle")}</strong>
                          <p className="mt-1 text-xs">
                            {t("calcNoCountryRateBody")}
                          </p>
                        </>
                      )}
                      {calcError.code === "SHIPPING_CAP_EXCEEDED" && (
                        <>
                          <strong>{t("calcShippingCapTitle")}</strong>
                          <p className="mt-1 text-xs">
                            {t("calcShippingCapBody", {
                              maxKg: (calcError as any).maxKg ?? 20,
                              actualKg:
                                (calcError as any).effectiveKg ?? "?",
                            })}
                          </p>
                        </>
                      )}
                      {calcError.code !== "MISSING_PRODUCT_WEIGHT" &&
                        calcError.code !== "NO_SHIPPING_RATE_FOR_COUNTRY" &&
                        calcError.code !== "SHIPPING_CAP_EXCEEDED" && (
                          <>
                            <strong>{t("calcGenericErrorTitle")}</strong>
                            <p className="mt-1 text-xs font-mono">
                              {calcError.code}
                            </p>
                          </>
                        )}
                    </div>
                  ) : loadingTotals || !calc ? (
                    <TotalsSkeleton />
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>{t("subtotal")}</span>
                        <span className="font-semibold">
                          {formatPrice(calc.subtotal)}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span>
                          {t("shipping")}{" "}
                          {isINR && calc.subtotal < shippingConfig.deliveryThreshold && !membershipActive && (
                            <span className="text-xs text-muted-foreground">
                              {t("freeOverHint", { amount: formatPrice(shippingConfig.deliveryThreshold) })}
                            </span>
                          )}
                        </span>
                        <span className="font-semibold">
                          {calc.shipping_fee === 0
                            ? t("shippingFree")
                            : formatPrice(calc.shipping_fee)}
                        </span>
                      </div>

                      {isINR && (() => {
                        const msg = shippingMessage(calc.subtotal, membership, shippingConfig);
                        const text =
                          msg.kind === "membership"
                            ? t("shippingMembership")
                            : msg.kind === "free"
                            ? t("shippingFreeApplied")
                            : t("shippingThreshold", { amount: `₹${msg.threshold.toLocaleString("en-IN")}` });
                        return (
                          <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-muted-foreground">
                            {text}
                          </div>
                        );
                      })()}

                      {/* International slab hint — cushion left in this
                          tier + next-tier cost delta. Buyer currency
                          comes from formatPrice. */}
                      {!isINR && calc.shipping_slab && (
                        <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                          {calc.shipping_slab.remaining_in_slab_g > 0 &&
                            !calc.shipping_slab.is_max_slab && (
                              <p>
                                {t("intlShippingTierCushion", {
                                  amount: formatWeight(
                                    calc.shipping_slab.remaining_in_slab_g
                                  ),
                                })}
                              </p>
                            )}
                          {calc.shipping_slab.is_max_slab ? (
                            <p>{t("intlShippingMaxTier")}</p>
                          ) : calc.shipping_slab.next_slab_label &&
                            calc.shipping_slab.next_slab_delta_inr != null ? (
                            <p>
                              {t("intlShippingNextTier", {
                                label: calc.shipping_slab.next_slab_label,
                                delta: formatPrice(
                                  calc.shipping_slab.next_slab_delta_inr
                                ),
                              })}
                            </p>
                          ) : null}
                        </div>
                      )}

                      {/* Delivery ETA. India narrows to the pincode's
                          zone once the pincode is valid; international
                          shows the country's configured range. Hidden
                          when no estimate is configured. */}
                      {eta && (
                        <p className="text-xs text-muted-foreground">
                          {t("deliveryEstimate", {
                            min: eta.min,
                            max: eta.max,
                          })}
                        </p>
                      )}

                      {/* International orders ship DDU — duties and taxes
                          are payable by the customer at customs in their
                          country. This is a regulatory disclosure, not a
                          UI nicety; do not hide it. */}
                      {!isINR && (
                        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          {t("intlCustomsNotice")}
                        </div>
                      )}

                      {calc.sale_savings && calc.sale_savings > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>{t("saleSavings")}</span>
                          <span className="font-semibold">
                            {formatPrice(calc.sale_savings)}
                          </span>
                        </div>
                      )}

                      {calc.discount_total > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>{t("promoDiscount")}</span>
                          <span className="font-semibold">
                            - {formatPrice(calc.discount_total)}
                          </span>
                        </div>
                      )}

                      <Separator />

                      <div className="flex justify-between text-lg font-bold">
                        <span>{t("total")}</span>
                        <span>{formatPrice(calc.total)}</span>
                      </div>

                      <Button
                        type="submit"
                        className="w-full"
                        size="lg"
                        disabled={
                          isProcessing ||
                          loadingProducts ||
                          loadingTotals ||
                          !!calcError
                        }
                      >
                        {isProcessing ? t("processing") : t("payWithRazorpay")}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {debug && (
                <DebugPanel
                  items={items}
                  calc={calc}
                  shipping={shippingCost}
                  loadingTotals={loadingTotals}
                />
              )}
            </div>
          </div>
        </form>
      </div>
    </CustomerLayout>
  );
}

function TotalsSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
      <div className="h-4 w-32 animate-pulse rounded bg-neutral-100" />
      <div className="h-4 w-28 animate-pulse rounded bg-neutral-100" />
      <div className="mt-3 h-10 w-full animate-pulse rounded bg-neutral-200" />
    </div>
  );
}

function DebugPanel({
  items,
  calc,
  shipping,
  loadingTotals,
}: {
  items: Array<{ product_id: string; quantity: number }>;
  calc: CalcTotals | null;
  shipping: number;
  loadingTotals: boolean;
}) {
  return (
    <div className="mt-4 rounded-xl border bg-white p-3 text-[11px]">
      <div className="mb-1 font-semibold">Debug</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <div>Items:</div>
        <div>
          {items.map((i) => `${i.product_id}×${i.quantity}`).join(", ") || "—"}
        </div>
        <div>Shipping (UI):</div>
        <div>{shipping}</div>
        <div>loadingTotals:</div>
        <div>{String(loadingTotals)}</div>
        <div>applied:</div>
        <div>{calc?.applied ? JSON.stringify(calc.applied) : "—"}</div>
        <div>subtotal:</div>
        <div>{calc?.subtotal ?? "—"}</div>
        <div>discount_total:</div>
        <div>{calc?.discount_total ?? "—"}</div>
        <div>shipping_fee (server):</div>
        <div>{calc?.shipping_fee ?? "—"}</div>
        <div>total:</div>
        <div>{calc?.total ?? "—"}</div>
      </div>

      {calc?.allocations && (
        <>
          <div className="mt-2 font-semibold">Allocations</div>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-neutral-50 p-2">
            {JSON.stringify(calc.allocations, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}
