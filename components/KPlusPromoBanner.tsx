"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Truck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MEMBERSHIP_PLAN_NAME,
  MEMBERSHIP_PRICE,
  MEMBERSHIP_DURATION_DAYS,
} from "@/lib/membership";
import { useCurrency } from "@/lib/contexts/CurrencyContext";

export function KPlusPromoBanner() {
  const t = useTranslations("kplusBanner");
  const { isINR } = useCurrency();
  // K Plus is an India-only product (free shipping benefits apply
  // only to Razorpay/Indian-pincode flows). Hide it entirely for
  // visitors viewing in a non-INR currency.
  if (!isINR) return null;

  return (
    <section className="container mx-auto py-8">
      <div className="overflow-hidden rounded-3xl border bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-800 text-white">
        <div className="grid gap-6 px-6 py-8 md:grid-cols-[1.2fr_0.8fr] md:px-10 md:py-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/80">
              <Sparkles className="h-3.5 w-3.5" />
              {t("membershipTag")}
            </div>

            <h2 className="mt-4 text-3xl font-bold md:text-4xl">
              {MEMBERSHIP_PLAN_NAME}
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 md:text-base">
              {t("tagline", {
                months: MEMBERSHIP_DURATION_DAYS / 30,
                price: MEMBERSHIP_PRICE,
              })}
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-sm text-white/85">
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2">
                {t("perkFreeDelivery")}
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2">
                {t("perkInstant")}
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2">
                {t("perkFrequent")}
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
            <div>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-black">
                <Truck className="h-6 w-6" />
              </div>

              <p className="mt-4 text-sm uppercase tracking-[0.2em] text-white/60">
                {t("limitedPlan")}
              </p>

              <p className="mt-2 text-4xl font-bold">₹{MEMBERSHIP_PRICE}</p>
              <p className="mt-1 text-sm text-white/70">
                {t("forDays", { days: MEMBERSHIP_DURATION_DAYS })}
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <Button
                asChild
                className="w-full rounded-full bg-white text-black hover:bg-white/90"
              >
                <Link href="/k-plus">{t("joinCta", { plan: MEMBERSHIP_PLAN_NAME })}</Link>
              </Button>

              <p className="text-center text-xs text-white/60">
                {t("footnote")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default KPlusPromoBanner;