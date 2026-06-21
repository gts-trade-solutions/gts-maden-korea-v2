"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, ShoppingBag, Tag, Check, X, Loader2 } from "lucide-react";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/lib/contexts/CartContext";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { useCountry } from "@/lib/contexts/CountryContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  computeShippingFee,
  shippingMessage,
  hasActiveMembership,
  getActiveMembership,
  type MembershipRow,
} from "@/lib/membership";
import { useShippingConfig } from "@/lib/hooks/useShippingConfig";
import { supabase } from "@/lib/supabaseClient";
import { resolveMediaUrl } from "@/lib/storage/backend";
import { toast } from "sonner";
import Image from "next/image";
import { fetchCountryOffers } from "@/lib/pricing";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

function readCountryFromCookie(): string {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  is_published?: boolean | null;
  price: number | null;
  currency: string | null;
  compare_at_price: number | null;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  hero_image_path: string | null;
  brands?: { name?: string | null } | null;
  hero_image_url?: string | null;
  // Phase 1 country offer override. Set by the cart's
  // augmentation step; takes precedence over sale_price/price in
  // the local effectiveUnitPrice resolver below.
  effective_price?: number | null;
};

type CartLine = { product_id: string; qty: number };

type TotalsResponse = null | {
  ok: true;
  currency: string;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  commission_total: number;
  applied: null | {
    type: "promo";
    code: string;
    scope: "global" | "product";
    influencer_id: string;
  };
  lines: Array<{
    product_id: string;
    qty: number;
    unit_price: number;
    line_subtotal: number;
    promo_applied: boolean;
    effective_user_discount_pct: number;
    effective_commission_pct: number;
    line_discount: number;
    line_commission: number;
  }>;
  // Slab-pricing metadata for international orders (null for India).
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

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  return resolveMediaUrl("product-media", path) ?? null;
}

function isSaleActive(start?: string | null, end?: string | null) {
  const now = new Date();
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

function effectiveUnitPrice(p: ProductRow) {
  // Country offer (Phase 1) wins over the legacy sale_price/price
  // resolution. Augmentation in the cart's useEffect attaches
  // effective_price for items the visitor's country has an offer on.
  if (p.effective_price != null) return Number(p.effective_price);
  const saleOk =
    p.sale_price != null && isSaleActive(p.sale_starts_at, p.sale_ends_at);
  return saleOk && p.sale_price != null ? p.sale_price : (p.price ?? 0);
}

// "150g" for small remainders, "1.5 kg" for >= 1kg. Drives the
// "you can add up to N more" hint under the international shipping
// line. Avoids switching units when crossing 1kg makes the hint
// suddenly less granular than the underlying slab cutoff.
function formatWeight(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) return "0g";
  if (grams < 1000) return `${Math.round(grams)}g`;
  const kg = grams / 1000;
  // Round to 1 decimal but drop a trailing .0
  const fixed = kg.toFixed(1).replace(/\.0$/, "");
  return `${fixed} kg`;
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

export default function CartPage() {
  const router = useRouter();
  const t = useTranslations("cart");
  const { ready: cartReady, loading, items, setQty, removeItem } = useCart();
  const { isAuthenticated } = useAuth();
  const shippingConfig = useShippingConfig();
  const { formatPrice, isINR } = useCurrency();
  const { country } = useCountry();

  // Delivery ETA for the current destination. Cart has no pincode yet
  // (that's collected on checkout), so India shows the broad range.
  // Result is `{min, max}` or null when not configured.
  const [eta, setEta] = useState<{ min: number; max: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/shipping/eta?country=${encodeURIComponent(country)}`,
          { cache: "no-store" }
        );
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
  }, [country]);

  const [membership, setMembership] = useState<MembershipRow | null>(null);
  // International order request modal — opened by the Checkout button
  // when the visitor isn't on INR. Indian visitors never see this.

  const [guestProducts, setGuestProducts] = useState<
    Record<string, ProductRow>
  >({});

  const [promoCode, setPromoCode] = useState("");
  const [applyingPromo, startApplyingPromo] = useTransition();

  const [totals, setTotals] = useState<TotalsResponse>(null);
  const [loadingTotals, setLoadingTotals] = useState(false);
  // Error from /api/checkout/calc-totals — populated when the API
  // refuses to price the cart (e.g. MISSING_PRODUCT_WEIGHT,
  // NO_SHIPPING_RATE_FOR_COUNTRY for international visitors). Without
  // surfacing this the cart silently falls back to a placeholder
  // (free shipping) and the customer can't tell why their payment
  // won't proceed.
  const [totalsError, setTotalsError] = useState<{
    code: string;
    productId?: string;
    maxKg?: number;
    effectiveKg?: number;
  } | null>(null);
  const [qtyUpdating, setQtyUpdating] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadMembership() {
      try {
        if (!isAuthenticated) {
          setMembership(null);
          return;
        }

        // Backend-aware: server resolves the user from the session (Supabase OR
        // NextAuth). Avoids the browser supabase.auth call that fails post-flip.
        const res = await fetch("/api/me/membership", { credentials: "include", cache: "no-store" });
        const j = res.ok ? await res.json() : {};
        if (!cancelled) setMembership((j?.membership as MembershipRow | null) ?? null);
      } catch (error) {
        console.error("Cart membership load error:", error);
        if (!cancelled) setMembership(null);
      }
    }

    loadMembership();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Phase 1 country-offer map for the cart. Keyed by product id ->
  // offer_price (INR). Empty entry means no offer for that product in
  // the visitor's country — falls through to legacy sale_price/price
  // logic in `effectiveUnitPrice`.
  const [cartCountryOffers, setCartCountryOffers] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!cartReady) return;
    const ids = Array.from(new Set(items.map((i) => i.product_id)));
    if (ids.length === 0) {
      setGuestProducts({});
      setCartCountryOffers({});
      return;
    }

    (async () => {
      const [{ data, error }, offers] = await Promise.all([
        supabase
          .from("products")
          .select(
            `
            id, slug, name, price, currency,
            is_published,
            compare_at_price, sale_price, sale_starts_at, sale_ends_at,
            hero_image_path, brands(name)
          `,
          )
          .in("id", ids),
        fetchCountryOffers(ids, readCountryFromCookie(), supabase),
      ]);

      if (error) {
        console.error(error);
        setGuestProducts({});
        setCartCountryOffers({});
        return;
      }

      const map: Record<string, ProductRow> = {};
      (data ?? []).forEach((p: any) => {
        map[p.id] = {
          ...p,
          hero_image_url: storagePublicUrl(p.hero_image_path),
        };
      });

      setGuestProducts(map);
      setCartCountryOffers(offers);
    })();
  }, [cartReady, items]);

  const rows = useMemo(() => {
    return items
      .map((it) => {
        // Attach the visitor's country-offer override (if any). The
        // effectiveUnitPrice resolver prefers `effective_price` over
        // sale_price/price, so this single field controls the cart
        // line price for both the server-cart and guest-cart paths.
        const countryOffer = cartCountryOffers[it.product_id];
        const p: ProductRow | undefined = (it as any).product
          ? {
              ...(it as any).product,
              hero_image_url: storagePublicUrl(
                (it as any).product.hero_image_path,
              ),
              effective_price: countryOffer ?? null,
            }
          : guestProducts[it.product_id]
            ? {
                ...guestProducts[it.product_id],
                effective_price: countryOffer ?? null,
              }
            : undefined;

        if (!p) {
          return {
            id: it.id,
            productId: it.product_id,
            quantity: it.quantity,
            product: {
              id: it.product_id,
              slug: "",
              name: t("rowNoLongerAvailable"),
              price: null,
              currency: "INR",
              compare_at_price: null,
              sale_price: null,
              sale_starts_at: null,
              sale_ends_at: null,
              hero_image_path: null,
            } as ProductRow,
            unitPrice: 0,
            lineTotal: 0,
            mrp: null,
            unavailable: true,
          };
        }

        const unavailable = p.is_published === false;
        const unit = unavailable ? 0 : effectiveUnitPrice(p);
        const line = unit * it.quantity;
        const mrp =
          p.compare_at_price && p.compare_at_price > unit
            ? p.compare_at_price
            : null;

        return {
          id: it.id,
          productId: it.product_id,
          quantity: it.quantity,
          product: p,
          unitPrice: unit,
          lineTotal: line,
          mrp,
          unavailable,
        };
      })
      .filter(Boolean) as {
      id: string;
      productId: string;
      quantity: number;
      product: ProductRow;
      unitPrice: number;
      lineTotal: number;
      mrp: number | null;
      unavailable: boolean;
    }[];
  }, [items, guestProducts, cartCountryOffers]);

  const unavailableCount = rows.filter((r) => r.unavailable).length;
  const availableRows = rows.filter((r) => !r.unavailable);

  const baseSubtotal = rows.reduce((acc, r) => acc + r.lineTotal, 0);

  const shippingFee = computeShippingFee(baseSubtotal, membership, shippingConfig);

  const qtySig = useMemo(
    () =>
      rows
        .map((r) => `${r.productId}:${r.quantity}`)
        .sort()
        .join("|"),
    [rows],
  );

async function recalcTotals() {
  if (rows.length === 0 || availableRows.length === 0) {
    setTotals(null);
    setTotalsError(null);
    return;
  }

  setLoadingTotals(true);

  try {
    const res = await fetch("/api/checkout/calc-totals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        lines: availableRows.map((r) => ({
          product_id: r.productId,
          qty: r.quantity,
        })),
        shippingFee,
      }),
    });

    const data = (await res.json()) as TotalsResponse & {
      error?: string;
      product_id?: string;
    };

    if (!res.ok || !data || (data as any).ok === false) {
      // Known structured errors get persisted so the cart can render a
      // specific banner explaining why pricing failed. Unknown errors
      // fall through to the generic toast.
      const code = (data as any)?.error || "CALC_FAILED";
      setTotals(null);
      setTotalsError({
        code,
        productId: (data as any)?.product_id,
        maxKg: (data as any)?.maxKg,
        effectiveKg: (data as any)?.effectiveKg,
      } as any);
      if (
        code !== "MISSING_PRODUCT_WEIGHT" &&
        code !== "NO_SHIPPING_RATE_FOR_COUNTRY" &&
        code !== "SHIPPING_CAP_EXCEEDED"
      ) {
        toast.error(t("calcFailedToast"));
      }
      return;
    }

    setTotals(data);
    setTotalsError(null);
  } catch (e: any) {
    console.error(e);
    toast.error(t("calcFailedToast"));
    setTotals(null);
    setTotalsError({ code: "CALC_FAILED" });
  } finally {
    setLoadingTotals(false);
  }
}

  useEffect(() => {
    void recalcTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtySig, shippingFee, availableRows.length]);

async function clearPromo() {
  const res = await fetch("/api/promo/clear", {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    toast.error(t("promoRemoveFailedToast"));
    return;
  }

  toast.info(t("promoRemovedToast"));
  await recalcTotals();
}

  const updateQty = async (rowId: string, nextQty: number) => {
    if (qtyUpdating[rowId]) return;
    setQtyUpdating((prev) => ({ ...prev, [rowId]: true }));
    try {
      await setQty(rowId, nextQty);
    } finally {
      setQtyUpdating((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const removeLine = async (rowId: string) => {
    if (removing[rowId]) return;
    if (!window.confirm(t("confirmRemove"))) return;
    setRemoving((prev) => ({ ...prev, [rowId]: true }));
    try {
      await removeItem(rowId);
      toast.success(t("itemRemovedToast"));
    } finally {
      setRemoving((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  function onApplyPromo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    startApplyingPromo(async () => {
      try {
        const res = await fetch("/api/promo/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });
        const j = await res.json();
        if (!res.ok || !j?.ok) {
          // Map stable server codes → translated strings; fall back to
          // raw server text for anything we don't recognise. The region
          // case is the most user-actionable: tell them the code isn't
          // valid for their chosen country so they can switch.
          if (j?.code === "PROMO_NOT_AVAILABLE_IN_REGION") {
            throw new Error(t("promoNotAvailableInRegionToast"));
          }
          throw new Error(j?.error || t("promoInvalidToast"));
        }
        toast.success(t("promoAppliedToast", { code: j?.promo?.code || code }));
        setPromoCode("");
        await recalcTotals();
      } catch (err: any) {
        toast.error(err?.message || t("promoApplyFailedToast"));
      }
    });
  }

  if (!cartReady || loading) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16 text-muted-foreground">
          {t("loadingCart")}
        </div>
      </CustomerLayout>
    );
  }

  if (rows.length === 0) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto text-center">
            <CardHeader>
              <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <CardTitle>{t("emptyTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">{t("emptyBody")}</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button asChild>
                  <Link href="/">{t("continueShopping")}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/wishlist">{t("emptyWishlistCta")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  const displayCurrency = totals?.currency || "INR";
  const displaySubtotal = totals?.subtotal ?? baseSubtotal;
  const displayShipping = totals?.shipping_fee ?? shippingFee;
  const displayDiscount = totals?.discount_total ?? 0;
  const displayTotal =
    totals?.total ?? Math.max(0, baseSubtotal + shippingFee - displayDiscount);

  const promoActive = totals?.applied?.type === "promo";
  const membershipActive = hasActiveMembership(membership);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">
          {t("headingWithCount", { count: rows.reduce((n, r) => n + r.quantity, 0) })}
        </h1>
        {unavailableCount > 0 && (
          <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            {t("unavailableNotice", { count: unavailableCount })}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {rows.map((row) => {
              const p = row.product;

              return (
                <Card key={row.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 flex items-start gap-3 sm:gap-4">
                        <Link
                          href={p.slug ? `/products/${p.slug}` : "#"}
                          className="block h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border bg-muted"
                        >
                          {p.hero_image_url ? (
                            <Image
                              src={p.hero_image_url}
                              alt={p.name ?? "Product image"}
                              width={80}
                              height={80}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              {t("noImage")}
                            </div>
                          )}
                        </Link>

                        <div className="min-w-0">
                          <Link
                            href={p.slug ? `/products/${p.slug}` : "#"}
                            className="hover:text-primary"
                          >
                            <h3 className="font-semibold mb-1 line-clamp-2">
                              {p.name}
                            </h3>
                          </Link>
                          {row.unavailable && (
                            <p className="text-xs text-orange-700">{t("rowRemovePrompt")}</p>
                          )}
                          {p.brands?.name && (
                            <p className="text-sm text-muted-foreground mb-1">
                              {p.brands.name}
                            </p>
                          )}
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold">
                              {row.unavailable ? "—" : formatPrice(row.unitPrice)}
                            </span>
                            {row.mrp && (
                              <span className="text-sm text-muted-foreground line-through">
                                {formatPrice(row.mrp)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className="flex items-center border rounded-lg">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateQty(row.id, Math.max(0, row.quantity - 1))}
                            disabled={row.unavailable || qtyUpdating[row.id] || removing[row.id]}
                          >
                            -
                          </Button>
                          <span className="px-3 py-1 min-w-[2.5rem] text-center">
                            {row.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateQty(row.id, row.quantity + 1)}
                            disabled={row.unavailable || qtyUpdating[row.id] || removing[row.id]}
                          >
                            +
                          </Button>
                        </div>

                        <p className="font-semibold whitespace-nowrap">
                          {formatPrice(row.lineTotal)}
                        </p>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(row.id)}
                          title={t("removeTitle")}
                          disabled={removing[row.id] || qtyUpdating[row.id]}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="lg:col-span-1 space-y-4">
            {!isAuthenticated && (
              <Card className="border-pink-200 bg-pink-50">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-pink-900">
                    {t("anonBannerTitle")}
                  </p>
                  <p className="mt-1 text-xs text-pink-800/80">
                    {t("anonBannerBody")}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      asChild
                      size="sm"
                      className="flex-1 bg-pink-600 hover:bg-pink-700 text-white"
                    >
                      <Link href="/auth/register">{t("anonBannerJoin")}</Link>
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="flex-1 border-pink-300 text-pink-900 hover:bg-pink-100"
                    >
                      <Link href="/auth/login">{t("anonBannerSignIn")}</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="lg:sticky lg:top-20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>{t("orderSummary")}</span>
                  {loadingTotals && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent
                className={`space-y-4 transition-opacity ${
                  loadingTotals ? "opacity-70" : "opacity-100"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {t("havePromo")}
                    </span>
                  </div>

                  {!promoActive ? (
                    <form onSubmit={onApplyPromo} className="flex gap-2">
                      <Input
                        placeholder={t("promoPlaceholder")}
                        value={promoCode}
                        onChange={(e) =>
                          setPromoCode(e.target.value.toUpperCase())
                        }
                        disabled={applyingPromo}
                        className="uppercase"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={applyingPromo || !promoCode.trim()}
                      >
                        {applyingPromo ? t("applying") : t("apply")}
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            {t("promoAppliedLabel", { code: totals?.applied?.code ?? "" })}
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300">
                            {totals?.applied?.scope === "global"
                              ? t("promoScopeGlobal")
                              : t("promoScopeProduct")}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={clearPromo}
                        className="h-8 w-8"
                        title={t("removePromoTitle")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between">
                  <span>{t("subtotal")}</span>
                  <span className="font-semibold">
                    {formatPrice(displaySubtotal)}
                  </span>
                </div>

                {displayDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>{t("discount")}</span>
                    <span className="font-semibold">
                      -{formatPrice(displayDiscount)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span>{t("shipping")}</span>
                  <span className="font-semibold">
                    {displayShipping === 0
                      ? t("shippingFree")
                      : formatPrice(displayShipping)}
                  </span>
                </div>

                {/* Delivery estimate. India shows the broad range here
                    (a precise zone needs the pincode, which is only
                    collected at checkout). International shows the
                    country's configured range. Renders nothing if the
                    admin hasn't configured an ETA for the destination. */}
                {eta && (
                  <p className="text-xs text-muted-foreground">
                    {t("deliveryEstimate", { min: eta.min, max: eta.max })}
                  </p>
                )}

                {/* International slab hint — sits above the customs
                    notice so the customer sees the actionable info
                    ("add a bit more before the next tier") first. */}
                {!isINR && totals?.shipping_slab && (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {totals.shipping_slab.remaining_in_slab_g > 0 &&
                      !totals.shipping_slab.is_max_slab && (
                        <p>
                          {t("intlShippingTierCushion", {
                            amount: formatWeight(
                              totals.shipping_slab.remaining_in_slab_g
                            ),
                          })}
                        </p>
                      )}
                    {totals.shipping_slab.is_max_slab ? (
                      <p>{t("intlShippingMaxTier")}</p>
                    ) : totals.shipping_slab.next_slab_label &&
                      totals.shipping_slab.next_slab_delta_inr != null ? (
                      <p>
                        {t("intlShippingNextTier", {
                          label: totals.shipping_slab.next_slab_label,
                          delta: formatPrice(
                            totals.shipping_slab.next_slab_delta_inr
                          ),
                        })}
                      </p>
                    ) : null}
                  </div>
                )}

                {/* India: existing threshold + K-Plus copy. International:
                    a single-line note that customs/duties are on the
                    buyer. `shippingMessage()` returns a kind+params
                    discriminated union — we translate it locally here. */}
                {(() => {
                  if (!isINR) {
                    return (
                      <p className="text-sm text-muted-foreground">
                        {t("intlCustomsNotice")}
                      </p>
                    );
                  }
                  if (displaySubtotal < shippingConfig.deliveryThreshold && !membershipActive) {
                    return (
                      <p className="text-sm text-muted-foreground">
                        {t("shippingAddMore", {
                          amount: formatPrice(
                            shippingConfig.deliveryThreshold - displaySubtotal
                          ),
                        })}
                      </p>
                    );
                  }
                  const msg = shippingMessage(displaySubtotal, membership, shippingConfig);
                  if (msg.kind === "membership") {
                    return <p className="text-sm text-muted-foreground">{t("shippingMembership")}</p>;
                  }
                  if (msg.kind === "free") {
                    return <p className="text-sm text-muted-foreground">{t("shippingFreeApplied")}</p>;
                  }
                  return (
                    <p className="text-sm text-muted-foreground">
                      {t("shippingThreshold", { amount: formatPrice(msg.threshold) })}
                    </p>
                  );
                })()}

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>{t("total")}</span>
                  <span>{formatPrice(displayTotal)}</span>
                </div>
                {loadingTotals && (
                  <p className="text-xs text-muted-foreground">{t("updatingTotals")}</p>
                )}

                {totalsError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {totalsError.code === "MISSING_PRODUCT_WEIGHT" && (
                      <>
                        <strong>{t("calcMissingWeightTitle")}</strong>
                        <p className="mt-1">{t("calcMissingWeightBody")}</p>
                      </>
                    )}
                    {totalsError.code === "NO_SHIPPING_RATE_FOR_COUNTRY" && (
                      <>
                        <strong>{t("calcNoCountryRateTitle")}</strong>
                        <p className="mt-1">{t("calcNoCountryRateBody")}</p>
                      </>
                    )}
                    {totalsError.code === "SHIPPING_CAP_EXCEEDED" && (
                      <>
                        <strong>{t("calcShippingCapTitle")}</strong>
                        <p className="mt-1">
                          {t("calcShippingCapBody", {
                            maxKg: (totalsError as any).maxKg ?? 20,
                            actualKg:
                              (totalsError as any).effectiveKg ?? "?",
                          })}
                        </p>
                      </>
                    )}
                    {totalsError.code !== "MISSING_PRODUCT_WEIGHT" &&
                      totalsError.code !== "NO_SHIPPING_RATE_FOR_COUNTRY" &&
                      totalsError.code !== "SHIPPING_CAP_EXCEEDED" && (
                        <>
                          <strong>{t("calcGenericErrorTitle")}</strong>
                          <p className="mt-1 font-mono">{totalsError.code}</p>
                        </>
                      )}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={
                    unavailableCount > 0 ||
                    availableRows.length === 0 ||
                    !!totalsError ||
                    loadingTotals
                  }
                  onClick={() => {
                    if (
                      unavailableCount > 0 ||
                      availableRows.length === 0 ||
                      !!totalsError
                    ) {
                      return;
                    }
                    if (!isAuthenticated) {
                      toast.message(t("signInToastTitle"), {
                        description: t("signInToastBody"),
                        action: {
                          label: t("signInToastAction"),
                          onClick: () => router.push("/auth/login?redirect=/checkout"),
                        },
                      });
                      return;
                    }
                    router.push("/checkout");
                  }}
                >
                  {t("checkoutBtn")}
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/">{t("continueShopping")}</Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
