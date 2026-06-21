"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useAuthSession } from "@/lib/auth/clientAuth";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Receipt,
} from "lucide-react";

type PayoutRow = {
  id: string;
  amount: number;
  currency: string;
  status: "initiated" | "processing" | "paid" | "failed";
  method: "store_credit" | "manual";
  request_note: string | null;
  contact_email: string | null;
  settled_reference: string | null;
  created_at: string;
  paid_at: string | null;
};

export default function PayoutsPage() {
  const supabase = createClientComponentClient();
  const t = useTranslations("influencer");
  // Backend-aware: Supabase access_token, or a NextAuth sentinel (cookie auth).
  const { token } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [filter, setFilter] = useState<
    "all" | "pending" | "settled" | "failed"
  >("all");

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const res = await fetch("/api/me/payouts", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok) setRows(j.payouts || []);
      setLoading(false);
    })();
  }, [token]);

  const filtered = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "pending")
      return r.status === "initiated" || r.status === "processing";
    if (filter === "settled") return r.status === "paid";
    if (filter === "failed") return r.status === "failed";
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-4">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <a href="/influencer" className="rounded-lg border bg-white p-2">
          <ArrowLeft className="h-4 w-4" />
        </a>
        <h1 className="text-lg font-semibold">{t("payoutHistoryTitle")}</h1>
      </div>

      {/* Filters */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          {t("filterAll")}
        </Chip>
        <Chip
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
        >
          {t("filterPending")}
        </Chip>
        <Chip
          active={filter === "settled"}
          onClick={() => setFilter("settled")}
        >
          {t("filterSettled")}
        </Chip>
        <Chip active={filter === "failed"} onClick={() => setFilter("failed")}>
          {t("filterFailed")}
        </Chip>
      </div>

      {/* List */}
      <div className="rounded-2xl border bg-white p-2 sm:p-3">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-neutral-600">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("walletStatusLoading")}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y">
            {filtered.map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                {/* Left */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={p.status} />
                    <MethodBadge method={p.method} />
                    {p.settled_reference && p.status === "paid" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                        <Receipt className="h-3.5 w-3.5" />
                        {p.settled_reference}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-xs text-neutral-600">
                    {t("requestedAt", { datetime: formatDateTime(p.created_at) })}
                    {p.paid_at && p.status === "paid"
                      ? t("settledAtSeparator", { datetime: formatDateTime(p.paid_at) })
                      : ""}
                    {p.request_note ? (
                      <>
                        <br />
                        {t("noteLine", { note: p.request_note })}
                      </>
                    ) : null}
                    {p.contact_email ? (
                      <>
                        <br />
                        {t("emailLine", { email: p.contact_email })}
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Right */}
                <div className="text-right text-sm font-semibold">
                  {toINR(p.amount)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer CTA */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href="/influencer"
          className="rounded-xl border bg-white px-4 py-2.5 text-center text-sm font-semibold"
        >
          {t("backToDashboard")}
        </a>
        <a
          href="/influencer"
          className="rounded-xl bg-black px-4 py-2.5 text-center text-sm font-semibold text-white"
        >
          {t("payoutRequest")}
        </a>
      </div>
    </div>
  );
}

/* --- Small atoms --- */

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-center text-xs font-medium ${
        active ? "border-black bg-black text-white" : "bg-neutral-50"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: PayoutRow["status"] }) {
  const t = useTranslations("influencer");
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> {t("statusSettled")}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        <XCircle className="h-3.5 w-3.5" /> {t("statusFailedLabel")}
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("statusProcessing")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      <Clock className="h-3.5 w-3.5" /> {t("statusPending")}
    </span>
  );
}

function MethodBadge({ method }: { method: PayoutRow["method"] }) {
  const t = useTranslations("influencer");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
        method === "store_credit"
          ? "bg-fuchsia-50 text-fuchsia-700"
          : "bg-neutral-100 text-neutral-700"
      }`}
    >
      {method === "store_credit" ? t("methodStoreCredit") : t("methodManual")}
    </span>
  );
}

function EmptyState() {
  const t = useTranslations("influencer");
  return (
    <div className="grid place-items-center gap-2 p-8 text-center">
      <div className="rounded-full bg-neutral-100 p-3">
        <Clock className="h-5 w-5 text-neutral-600" />
      </div>
      <div className="text-sm font-semibold">{t("payoutsEmptyTitle")}</div>
      <p className="max-w-xs text-xs text-neutral-600">
        {t("payoutsEmptyDesc")}
      </p>
    </div>
  );
}

function toINR(n: number) {
  try {
    return n.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });
  } catch {
    return `₹${Math.round(n)}`;
  }
}

function formatDateTime(s: string) {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}
