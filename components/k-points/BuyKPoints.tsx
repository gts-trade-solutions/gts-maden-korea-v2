"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { KCoin } from "@/components/k-points/KCoin";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/contexts/CurrencyContext";

type Pack = { id: string; points: number; bonusPoints: number; priceInr: number };

export function BuyKPoints() {
  const router = useRouter();
  const { formatPrice } = useCurrency();
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/points/packs", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPacks(d.packs ?? []))
      .catch(() => setPacks([]));
  }, []);

  async function buy(pack: Pack) {
    if (busy) return;
    setBusy(pack.id);
    try {
      const cr = await fetch("/api/points/purchase/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: pack.id }),
      });
      const cj = await cr.json();
      if (!cr.ok || !cj?.order?.id) {
        toast.error(cj?.error || "Could not start purchase");
        setBusy(null);
        return;
      }
      if (!(window as any).Razorpay) {
        toast.error("Payment SDK not loaded");
        setBusy(null);
        return;
      }
      const rzp = new (window as any).Razorpay({
        key: cj.key,
        amount: cj.order.amount,
        currency: cj.order.currency,
        name: "MadenKorea",
        description: `${(pack.points + pack.bonusPoints).toLocaleString()} K-Points`,
        order_id: cj.order.id,
        theme: { color: "#f59e0b" },
        handler: async (resp: any) => {
          try {
            const vr = await fetch("/api/points/purchase/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              }),
            });
            const vj = await vr.json();
            if (vr.ok && vj?.success) {
              toast.success("K-Points added to your balance");
              router.refresh();
            } else {
              toast.error(vj?.error || "Verification failed");
            }
          } catch {
            toast.error("Verification error");
          } finally {
            setBusy(null);
          }
        },
        modal: {
          ondismiss() {
            setBusy(null);
          },
        },
      });
      rzp.open();
    } catch {
      toast.error("Something went wrong");
      setBusy(null);
    }
  }

  if (packs === null)
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (!packs.length) return null;

  // Best value = most total points per unit of money. Highlighted as a nudge.
  const bestId =
    packs.length > 1
      ? packs.reduce((best, p) =>
          (p.points + p.bonusPoints) / p.priceInr >
          (best.points + best.bonusPoints) / best.priceInr
            ? p
            : best,
        ).id
      : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {packs.map((p) => {
        const total = p.points + p.bonusPoints;
        const bonusPct = p.points > 0 ? Math.round((p.bonusPoints / p.points) * 100) : 0;
        const best = p.id === bestId;
        return (
          <div
            key={p.id}
            className={`relative flex flex-col rounded-2xl border bg-gradient-to-b from-amber-50/70 to-white p-5 text-center ${
              best ? "border-amber-400 ring-2 ring-amber-300" : "border-amber-200"
            }`}
          >
            {best ? (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                Best value
              </span>
            ) : null}

            <KCoin className="mx-auto h-8 w-8" />

            {/* Headline: total points the customer receives */}
            <div className="mt-2 text-3xl font-extrabold tabular-nums text-amber-700">
              {total.toLocaleString()}
            </div>
            <div className="text-xs font-medium text-muted-foreground">K-Points</div>

            {/* The benefit — bonus points, stated plainly */}
            {p.bonusPoints > 0 ? (
              <div className="mt-2 inline-flex items-center justify-center gap-1 self-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <Sparkles className="h-3.5 w-3.5" />
                {p.points.toLocaleString()} + {p.bonusPoints.toLocaleString()} free
                {bonusPct > 0 ? ` (${bonusPct}% extra)` : ""}
              </div>
            ) : (
              <div className="mt-2 h-[26px]" aria-hidden />
            )}

            <div className="mt-3 text-xl font-bold text-slate-900">
              {formatPrice(p.priceInr)}
            </div>

            <Button
              className="mt-3 w-full"
              disabled={busy === p.id}
              onClick={() => buy(p)}
            >
              {busy === p.id ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Buy now
            </Button>
          </div>
        );
      })}
    </div>
  );
}
