import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getBalance, getLedger } from "@/lib/k-points/service";
import { prisma } from "@/lib/db/prisma";
import { BuyKPoints } from "@/components/k-points/BuyKPoints";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { KCoin } from "@/components/k-points/KCoin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  purchase: "Earned on purchase",
  signup: "Welcome bonus",
  review: "Product review",
  referral: "Referral bonus",
  redeem: "Redeemed at checkout",
  buy: "Purchased K-Points",
  admin_grant: "Adjustment",
  skin_access: "Skin analyzer access",
  expiry: "Expired",
  reversal: "Reversed",
};

export default async function AccountKPointsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login?redirect=/account/k-points");

  const [balance, ledger, packCount] = await Promise.all([
    getBalance(user.id),
    getLedger(user.id, 100),
    prisma.kPointsPack.count({ where: { active: true } }),
  ]);

  return (
    <CustomerLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <KCoin className="h-6 w-6" /> K-Points
          </h1>
          <Button asChild variant="outline" size="sm">
            <Link href="/k-points">How it works</Link>
          </Button>
        </div>

        {/* Balance */}
        <Card className="mb-6 overflow-hidden border-amber-200">
          <CardContent className="flex flex-wrap items-end justify-between gap-4 bg-gradient-to-br from-amber-50 to-white p-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                Available balance
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums text-amber-700">
                  {balance.available.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">K-Points</span>
              </div>
              {balance.reserved > 0 ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  {balance.reserved.toLocaleString()} on hold for a pending order
                </div>
              ) : null}
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Lifetime earned</div>
                <div className="font-semibold tabular-nums">
                  {balance.lifetimeEarned.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Lifetime spent</div>
                <div className="font-semibold tabular-nums">
                  {balance.lifetimeSpent.toLocaleString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Buy K-Points */}
        {packCount > 0 ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Buy K-Points</CardTitle>
              <p className="text-sm text-muted-foreground">
                Top up instantly and redeem for discounts at checkout. Bigger
                packs include bonus points.
              </p>
            </CardHeader>
            <CardContent>
              <BuyKPoints />
            </CardContent>
          </Card>
        ) : null}

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            {ledger.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No K-Points activity yet. Start earning by shopping and reviewing
                products.
              </p>
            ) : (
              <ul className="divide-y">
                {ledger.map((e) => {
                  const positive = e.delta > 0;
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            positive ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                          }`}
                        >
                          {positive ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {REASON_LABEL[e.reason] ?? e.reason}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(e.createdAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                            {e.expiresAt ? (
                              <span className="ml-2 inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                expires{" "}
                                {new Date(e.expiresAt).toLocaleDateString(undefined, {
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          positive ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {positive ? "+" : ""}
                        {e.delta.toLocaleString()}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Redeem your K-Points for a discount at checkout.
        </p>
      </div>
    </CustomerLayout>
  );
}
