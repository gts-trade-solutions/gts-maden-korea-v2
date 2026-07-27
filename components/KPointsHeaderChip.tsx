"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KCoin } from "@/components/k-points/KCoin";
import { useAuth } from "@/lib/contexts/AuthContext";

/**
 * Live K-Points balance in the header for logged-in users. Hidden for guests.
 * Fetches once per auth change; re-fetches when the tab regains focus so a
 * fresh earn/spend shows up without a full reload.
 */
export function KPointsHeaderChip({ className = "" }: { className?: string }) {
  const { isAuthenticated, ready } = useAuth();
  const [points, setPoints] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !isAuthenticated) {
      setPoints(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/me/k-points", { cache: "no-store" });
        const d = await r.json();
        if (alive && d.authed) setPoints(d.balance?.available ?? 0);
      } catch {
        /* ignore */
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, isAuthenticated]);

  if (!isAuthenticated || points === null) return null;

  return (
    <Link
      href="/account/k-points"
      aria-label={`${points} K-Points`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white py-0.5 pl-0.5 pr-2.5 text-xs font-bold text-amber-900 shadow-sm transition-colors hover:bg-amber-50 ${className}`}
    >
      {/* coin sits in its own well so the gold reads against white, not gold */}
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-200">
        <KCoin className="h-4 w-4" />
      </span>
      <span className="tabular-nums">{points.toLocaleString()}</span>
    </Link>
  );
}
