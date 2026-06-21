"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Sparkles,
  Truck,
  ShieldCheck,
  Clock3,
  BadgePercent,
  Crown,
  CheckCircle2,
} from "lucide-react";
import {
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_PRICE,
  MEMBERSHIP_DURATION_DAYS,
  getActiveMembership,
  type MembershipRow,
} from "@/lib/membership";
import { useShippingConfig } from "@/lib/hooks/useShippingConfig";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { useAuth } from "@/lib/contexts/AuthContext";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export default function KPlusPage() {
  const router = useRouter();
  const shippingConfig = useShippingConfig();
  const thresholdLabel = `₹${shippingConfig.deliveryThreshold.toLocaleString("en-IN")}`;
  const { isINR } = useCurrency();

  // K Plus is India-only. International visitors landing here see a
  // brief explainer + a link to /contact instead of the join flow.
  // We render this gate AFTER the existing hooks below to keep hook
  // order stable (early-return-after-state is fine; React only cares
  // about hook order, not which branch we exit through).

  // Backend-aware identity (Supabase or NextAuth) via the auth context.
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [checkingMembership, setCheckingMembership] = useState(true);
  const [activeMembership, setActiveMembership] =
    useState<MembershipRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMembership() {
      try {
        // Backend-aware: server resolves the user from the session (Supabase OR
        // NextAuth). Avoids the browser supabase.auth call that fails post-flip.
        const res = await fetch("/api/me/membership", { credentials: "include", cache: "no-store" });
        const j = res.ok ? await res.json() : {};
        if (!cancelled) {
          setActiveMembership((j?.membership as MembershipRow | null) ?? null);
          setCheckingMembership(false);
        }
      } catch (error) {
        console.error("K-Plus membership load error:", error);
        if (!cancelled) {
          setActiveMembership(null);
          setCheckingMembership(false);
        }
      }
    }

    loadMembership();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshMembership = async (_uid?: string) => {
    try {
      const res = await fetch("/api/me/membership", { credentials: "include", cache: "no-store" });
      const j = res.ok ? await res.json() : {};
      setActiveMembership((j?.membership as MembershipRow | null) ?? null);
    } catch (error) {
      console.error("K-Plus membership refresh error:", error);
    }
  };

  const joinMembership = async () => {
    try {
      if (!userId) {
        toast.info("Please login to continue");
        router.push("/auth/login?redirect=/k-plus");
        return;
      }

      if (!window.Razorpay) {
        toast.error("Razorpay is not loaded");
        return;
      }

      setLoading(true);

      const createOrderRes = await fetch("/api/membership/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const createOrderData = await createOrderRes.json();

      if (!createOrderRes.ok || !createOrderData?.order?.id) {
        throw new Error(
          createOrderData?.error || "Unable to create membership order"
        );
      }

      if (createOrderData?.alreadyActive) {
        const expiryText = createOrderData?.currentExpiry
          ? new Date(createOrderData.currentExpiry).toLocaleDateString("en-IN")
          : "your current period";
        const proceed = window.confirm(
          `You already have an active ${MEMBERSHIP_PLAN_NAME} membership until ${expiryText}. Do you want to continue and extend/repurchase now?`
        );
        if (!proceed) {
          setLoading(false);
          return;
        }
      }

      const order = createOrderData.order;
      const razorpayKey = createOrderData.key;

      if (!razorpayKey) {
        throw new Error("Razorpay key is missing");
      }

      const options = {
        key: razorpayKey,
        amount: order.amount,
        currency: order.currency,
        name: "MadenKorea",
        description: `${MEMBERSHIP_PLAN_NAME} Membership - Free delivery for 3 months`,
        order_id: order.id,
        prefill: {},
        notes: {
          type: "membership",
          plan_code: "k_plus",
          user_id: userId,
        },
        handler: async function (response: any) {
          const verifyRes = await fetch("/api/membership/verify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          const verifyData = await verifyRes.json();

          if (!verifyRes.ok || !verifyData?.success) {
            toast.error(verifyData?.error || "Membership verification failed");
            return;
          }

          toast.success(`${MEMBERSHIP_PLAN_NAME} activated successfully`);
          await refreshMembership(userId);
        },
        modal: {
          ondismiss() {
            toast.info("Payment cancelled");
          },
        },
        theme: {
          color: "#111111",
        },
      };

      const rzp = new window.Razorpay(options);

      rzp.on("payment.failed", () => {
        toast.error("Payment failed");
      });

      rzp.open();
    } catch (error: any) {
      console.error("K-Plus purchase error:", error);
      toast.error(error?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const expiryText = activeMembership?.ends_at
    ? new Date(activeMembership.ends_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  // International gate: K Plus is an India-only product; hide it
  // entirely for non-IN visitors (redirect home so the URL leaves no
  // trace of the membership flow).
  useEffect(() => {
    if (!isINR) router.replace("/");
  }, [isINR, router]);
  if (!isINR) return null;

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />

      <CustomerLayout>
        <div className="container mx-auto py-10 md:py-14">
          <div className="overflow-hidden rounded-[32px] border bg-white shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="relative overflow-hidden border-b lg:border-b-0 lg:border-r">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_36%)]" />

                <div className="relative px-6 py-8 md:px-10 md:py-10">
                  <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Membership
                  </div>

                  <h1 className="mt-5 text-4xl font-bold tracking-tight text-neutral-950 md:text-5xl">
                    {MEMBERSHIP_PLAN_NAME}
                  </h1>

                  <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-600 md:text-lg">
                    Free delivery for{" "}
                    <span className="font-semibold text-neutral-950">
                      {MEMBERSHIP_DURATION_DAYS / 30} months
                    </span>{" "}
                    at just{" "}
                    <span className="font-semibold text-neutral-950">
                      ₹{MEMBERSHIP_PRICE}
                    </span>
                    . Shop more often and stop worrying about shipping charges on
                    your beauty orders.
                  </p>

                  <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border bg-white p-4 shadow-sm">
                      <Truck className="h-5 w-5 text-indigo-600" />
                      <p className="mt-3 text-sm font-semibold text-neutral-950">
                        Free Delivery
                      </p>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        No shipping fees during active membership.
                      </p>
                    </div>

                    <div className="rounded-2xl border bg-white p-4 shadow-sm">
                      <Clock3 className="h-5 w-5 text-sky-600" />
                      <p className="mt-3 text-sm font-semibold text-neutral-950">
                        3 Months Access
                      </p>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        One-time join, instant access after payment.
                      </p>
                    </div>

                    <div className="rounded-2xl border bg-white p-4 shadow-sm">
                      <BadgePercent className="h-5 w-5 text-violet-600" />
                      <p className="mt-3 text-sm font-semibold text-neutral-950">
                        Better Value
                      </p>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        Great for frequent small and medium orders.
                      </p>
                    </div>

                    <div className="rounded-2xl border bg-white p-4 shadow-sm">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      <p className="mt-3 text-sm font-semibold text-neutral-950">
                        Simple & Secure
                      </p>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        Powered by Razorpay and activated instantly.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border bg-neutral-50 p-5">
                      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        Regular Shopping
                      </p>
                      <ul className="mt-4 space-y-3 text-sm text-neutral-600">
                        <li className="flex gap-2">
                          <span>•</span>
                          <span>Free delivery only above {thresholdLabel}</span>
                        </li>
                        <li className="flex gap-2">
                          <span>•</span>
                          <span>Shipping charge applies on smaller orders</span>
                        </li>
                        <li className="flex gap-2">
                          <span>•</span>
                          <span>Less value for repeat low-ticket purchases</span>
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-sky-50 to-white p-5">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-indigo-700" />
                        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-700">
                          With {MEMBERSHIP_PLAN_NAME}
                        </p>
                      </div>
                      <ul className="mt-4 space-y-3 text-sm text-neutral-700">
                        <li className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-indigo-600" />
                          <span>Free delivery on eligible orders</span>
                        </li>
                        <li className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-indigo-600" />
                          <span>No delivery charges for 3 months</span>
                        </li>
                        <li className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-indigo-600" />
                          <span>Best suited for repeat beauty orders</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-50/60 px-6 py-8 md:px-8 md:py-10">
                <div className="mx-auto max-w-md rounded-[28px] border bg-white p-6 shadow-[0_16px_40px_rgba(0,0,0,0.06)]">
                  <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">
                    Plan Details
                  </p>

                  <div className="mt-5 rounded-3xl bg-gradient-to-r from-sky-600 via-indigo-600 to-violet-600 px-5 py-6 text-white">
                    <p className="text-sm font-medium uppercase tracking-[0.14em] text-white/80">
                      {MEMBERSHIP_PLAN_NAME}
                    </p>
                    <p className="mt-2 text-4xl font-bold">₹{MEMBERSHIP_PRICE}</p>
                    <p className="mt-1 text-sm text-white/80">
                      for {MEMBERSHIP_DURATION_DAYS} days
                    </p>
                  </div>

                  <div className="mt-6 space-y-3 text-sm text-neutral-700">
                    <div className="flex items-start gap-3 rounded-2xl border p-4">
                      <Truck className="mt-0.5 h-4 w-4 text-indigo-600" />
                      <div>
                        <p className="font-medium text-neutral-950">
                          Shipping-free shopping
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Enjoy free delivery during membership validity.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border p-4">
                      <Clock3 className="mt-0.5 h-4 w-4 text-indigo-600" />
                      <div>
                        <p className="font-medium text-neutral-950">
                          Valid for 3 months
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          A single payment unlocks 90 days of benefits.
                        </p>
                      </div>
                    </div>
                  </div>

                  {checkingMembership ? (
                    <div className="mt-6 rounded-2xl border p-4 text-sm text-neutral-500">
                      Checking membership status...
                    </div>
                  ) : activeMembership ? (
                    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm font-semibold text-emerald-700">
                        {activeMembership.plan_name || MEMBERSHIP_PLAN_NAME} is
                        active
                      </p>
                      <p className="mt-2 text-sm text-emerald-700">
                        Valid until {expiryText}
                      </p>
                    </div>
                  ) : (
                    <Button
                      className="mt-6 h-12 w-full rounded-full bg-gradient-to-r from-sky-600 via-indigo-600 to-violet-600 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 hover:opacity-95"
                      onClick={joinMembership}
                      disabled={loading}
                    >
                      {loading ? "Processing..." : `Join ${MEMBERSHIP_PLAN_NAME}`}
                    </Button>
                  )}

                  {!activeMembership && !checkingMembership && (
                    <p className="mt-4 text-center text-xs leading-5 text-neutral-500">
                      One-time payment. Membership activates instantly after
                      successful payment.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CustomerLayout>
    </>
  );
}
