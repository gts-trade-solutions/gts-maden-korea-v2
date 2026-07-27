import Link from "next/link";
import type { Metadata } from "next";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { getKPointsRules, getKPointsSettings } from "@/lib/k-points/config";
import {
  ShoppingBag,
  Star,
  UserPlus,
  Users,
  Gift,
  ScanFace,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { KCoin } from "@/components/k-points/KCoin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "K-Points — Earn & Save",
  description:
    "Earn K-Points on everything you do at MadeNKorea and spend them for discounts, exclusive perks and skin analyzer access.",
};

export default async function KPointsLandingPage() {
  const [rules, settings] = await Promise.all([getKPointsRules(), getKPointsSettings()]);

  const earn = [
    rules.purchase?.enabled && {
      icon: ShoppingBag,
      title: "Shop and earn",
      body:
        rules.purchase.mode === "percent"
          ? `Get ${trim(rules.purchase.value)}% of every order back as K-Points.`
          : `Earn ${trim(rules.purchase.value)} K-Points on every order.`,
    },
    rules.signup?.enabled && {
      icon: UserPlus,
      title: "Welcome bonus",
      body: `Get ${trim(rules.signup.value)} K-Points just for creating an account.`,
    },
    rules.review?.enabled && {
      icon: Star,
      title: "Review products",
      body: `Earn ${trim(rules.review.value)} K-Points for each approved product review.`,
    },
    rules.referral?.enabled && {
      icon: Users,
      title: "Refer friends",
      body:
        rules.referral.mode === "percent"
          ? `Earn ${trim(rules.referral.value)}% in K-Points from referred orders.`
          : `Earn ${trim(rules.referral.value)} K-Points for referrals.`,
    },
  ].filter(Boolean) as { icon: any; title: string; body: string }[];

  const spend = [
    {
      icon: Gift,
      title: "Discounts at checkout",
      body: `Redeem K-Points for money off your products — up to ${settings.redeemCapPercent}% of your item total. Shipping is always paid separately.`,
    },
    {
      icon: ScanFace,
      title: "AI Skin Analyzer",
      body: "Unlock a full AI skin analysis with your K-Points.",
    },
    {
      icon: Wallet,
      title: "Top up anytime",
      body: "Running low? Buy K-Points instantly and keep saving.",
    },
  ];

  return (
    <CustomerLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-amber-50 via-white to-white">
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-amber-200/50 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:py-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white/70 px-3 py-1 text-xs font-medium text-amber-700 backdrop-blur">
            <KCoin className="h-3.5 w-3.5" /> MadeNKorea Rewards
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Meet{" "}
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              K-Points
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            Earn K-Points across everything you do at MadeNKorea, then spend them
            for real savings — discounts, perks and AI skin analysis.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/account/k-points">
                <KCoin className="mr-2 h-4 w-4" /> View my K-Points
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/auth/register?redirect=/k-points">Create a free account</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {trim(settings.basePointsPerUnit)} K-Points ≈ 1 {settings.baseCurrency}
          </p>
        </div>
      </section>

      {/* Earn */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          Ways to earn
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(earn.length ? earn : DEFAULT_EARN).map((e, i) => (
            <div key={i} className="rounded-2xl border bg-card p-5 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <e.icon className="h-5 w-5" />
              </span>
              <div className="mt-3 font-medium">{e.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{e.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Spend */}
      <section className="bg-muted/30 py-14">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Ways to use them
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {spend.map((s, i) => (
              <div key={i} className="rounded-2xl border bg-card p-5 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                  <s.icon className="h-5 w-5" />
                </span>
                <div className="mt-3 font-medium">{s.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Good to know */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          Good to know
        </h2>
        <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Your K-Points balance is always visible in the header when you&apos;re
            signed in.
          </li>
          {settings.pointsExpiryDays > 0 ? (
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              K-Points are valid for {settings.pointsExpiryDays} days from the day
              you earn them.
            </li>
          ) : null}
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Redeem up to {settings.redeemCapPercent}% of your product total with
            K-Points — shipping is always paid in full.
          </li>
        </ul>
        <div className="mt-8 text-center">
          <Button asChild size="lg">
            <Link href="/account/k-points">
              <KCoin className="mr-2 h-4 w-4" /> Go to my K-Points
            </Link>
          </Button>
        </div>
      </section>
    </CustomerLayout>
  );
}

const DEFAULT_EARN = [
  { icon: ShoppingBag, title: "Shop and earn", body: "Collect K-Points on every order." },
  { icon: UserPlus, title: "Welcome bonus", body: "Get K-Points for creating an account." },
  { icon: Star, title: "Review products", body: "Earn K-Points for your reviews." },
  { icon: Users, title: "Refer friends", body: "Earn K-Points from referrals." },
];

// Trim trailing zeros from a decimal (e.g. 5.00 → 5, 2.50 → 2.5).
function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}
