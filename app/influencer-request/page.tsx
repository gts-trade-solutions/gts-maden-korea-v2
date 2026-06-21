"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { resolveMediaUrl } from "@/lib/storage/backend";
import { clientAuthToken } from "@/lib/auth/clientAuth";
import {
  ArrowRight,
  Gift,
  LineChart,
  ShieldCheck,
  Percent,
  Clock,
  X,
  BadgeCheck,
  Users2,
  Star,
  HelpCircle,
  ChevronDown,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/lib/contexts/AuthContext";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

type Status = "none" | "pending" | "rejected" | "influencer" | "admin";

// Read `mik_country` from document.cookie at call time. Client-side
// helper so we can resolve the visitor's country for the
// "How it works" video selection.
function readCountryFromCookie(): string {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

// ✅ Same pattern as your /auth/login and /account pages (persist session in localStorage)
export default function PartnerProgramPage() {
  const router = useRouter();
  const t = useTranslations("influencerRequest");
  const { isAuthenticated, ready: authReady } = useAuth();

  // status
  const [status, setStatus] = useState<Status>("none");
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const isApproved = status === "influencer" || status === "admin";

  // modal + form
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // How-It-Works video. Admin uploads one per country at
  // /admin/cms/k-partnership-videos. Visitor's country wins; falls
  // back to store_settings.k_partnership_default_country. If neither
  // resolves, the video block isn't rendered at all (the existing
  // step cards still show on their own).
  const [howItWorksVideoUrl, setHowItWorksVideoUrl] = useState<string | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const country = readCountryFromCookie();

      // 1) Try the visitor's country.
      const { data: own } = await supabase
        .from("k_partnership_videos")
        .select("storage_path")
        .eq("country_code", country)
        .maybeSingle<{ storage_path: string }>();

      let chosenPath: string | null = own?.storage_path ?? null;

      // 2) Fall back to the admin-selected default country.
      if (!chosenPath) {
        const { data: settings } = await supabase
          .from("store_settings")
          .select("k_partnership_default_country")
          .eq("id", 1)
          .maybeSingle<{ k_partnership_default_country: string | null }>();
        const fallback = settings?.k_partnership_default_country;
        if (fallback) {
          const { data: fallbackRow } = await supabase
            .from("k_partnership_videos")
            .select("storage_path")
            .eq("country_code", fallback)
            .maybeSingle<{ storage_path: string }>();
          chosenPath = fallbackRow?.storage_path ?? null;
        }
      }

      if (cancelled) return;
      if (chosenPath) {
        setHowItWorksVideoUrl(resolveMediaUrl("site-assets", chosenPath) ?? null);
      } else {
        setHowItWorksVideoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The K-Partnership landing page is intentionally PUBLIC. Anonymous
  // visitors should be able to read about what the program is, watch
  // the explainer video, and skim the FAQ — they're only kicked to
  // sign-in if they actually click "Become a Partner" (handled at the
  // CTA, not at the page level). Earlier versions of this effect
  // redirected unauthenticated users to /auth/login on page load,
  // which made the program effectively invisible to anyone who wasn't
  // already a customer.
  //
  // No effect needed here any more — auth state is read inline where
  // it actually matters (status fetch + CTA click handlers below).

  // ✅ 2) Attach browser session to server cookies ONCE (same idea as /auth/login + /auth/callback)
  const attachedOnce = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (attachedOnce.current) return;
    attachedOnce.current = true;

    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      const rt = s?.session?.refresh_token;
      if (!at || !rt) return;

      fetch("/api/auth/attach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_token: at, refresh_token: rt }),
      }).catch(() => {});
    })();
  }, [isAuthenticated]);

  // helper: get token or kick to login (no reload)
  const getAccessTokenOrRedirect = async () => {
    const at = await clientAuthToken();
    if (!at) {
      router.replace("/auth/login?redirect=/influencer-request");
      return null;
    }
    return at;
  };

  // Load the user's K-Partnership status once we know who they are.
  // For anon visitors we short-circuit to status="none" + finished
  // loading so the CTA renders the default "Become a Partner" pill
  // immediately instead of getting stuck on the loading placeholder.
  useEffect(() => {
    if (!authReady) return;

    if (!isAuthenticated) {
      setStatus("none");
      setStatusLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      setErr(null);

      const at = await getAccessTokenOrRedirect();
      if (!at) return;

      try {
        const res = await fetch(`/api/influencer/status?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${at}` },
          cache: "no-store",
        });

        const j = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setErr(j?.error || t("errLoadStatus"));
        } else {
          setStatus((j?.status as Status) ?? "none");
          setRequestedAt(j?.requested_at ?? null);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || t("errNetwork"));
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authReady]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setSubmitting(true);

    const at = await getAccessTokenOrRedirect();
    if (!at) {
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/influencer/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${at}`,
        },
        credentials: "include",
        body: JSON.stringify({ handle, note, social: {} }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok || j?.ok === false) {
        setErr(j?.error || t("errSubmit"));
      } else {
        setMsg(j?.message || t("toastSubmitted"));
        setHandle("");
        setNote("");
        setStatus("pending");
        setRequestedAt(new Date().toISOString());
        setOpen(false);
      }
    } catch (e: any) {
      setErr(e?.message || t("errNetwork"));
    } finally {
      setSubmitting(false);
    }
  }

  // Page renders for everyone — authed + anon. Auth-specific UI bits
  // (status pill, "Visit Portal" CTA, edit-cap modal, etc.) are gated
  // inside the JSX where they live, not at the page level. The
  // "Become a Partner" CTA below redirects anon clicks to /auth/login.
  return (
    <>
      <Header />

      <div className="min-h-screen bg-[radial-gradient(60%_60%_at_20%_-10%,#FDECEC,transparent),radial-gradient(40%_50%_at_100%_0%,#E8F7FF,transparent)] text-neutral-900">
        {/* ============ HERO — Consumer Innovations banner ============ */}
        <section className="relative isolate">
          <div
            className="absolute inset-0 -z-10 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1616394584738-fc6e612b1df9?q=80&w=1920&auto=format&fit=crop')",
            }}
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white/70 via-white/40 to-white/10" />
          <div className="pointer-events-none absolute inset-0 -z-10 mix-blend-overlay [background:radial-gradient(60%_60%_at_50%_0%,rgba(255,255,255,0.2),rgba(255,255,255,0))]" />

          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
            <div className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-2xl backdrop-blur">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                    {t("heroPill")}
                  </p>
                  <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                    {t("heroTitle")}
                  </h1>
                  <p className="mt-2 text-sm text-neutral-700">
                    {t("heroBody")}
                  </p>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {statusLoading ? (
                      <span
                        aria-hidden="true"
                        className="inline-block h-[46px] w-44 animate-pulse rounded-xl bg-neutral-200/80"
                      />
                    ) : (
                      <>
                        {isApproved ? (
                          <button
                            onClick={() => router.push("/influencer")}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400"
                          >
                            {t("ctaVisitPortal")} <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : status === "pending" ? (
                          <span className="inline-flex items-center justify-center rounded-xl bg-amber-300/90 px-4 py-3 text-sm font-semibold text-amber-900">
                            {t("ctaPendingReview")}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              // Anon click → take them to sign-in
                              // first, then return to this page.
                              // After login the status fetch will run
                              // and they'll see the same CTA again,
                              // this time wiring to the application
                              // modal because they're authed.
                              if (!isAuthenticated) {
                                router.push(
                                  "/auth/login?redirect=/influencer-request"
                                );
                                return;
                              }
                              setOpen(true);
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-black/90"
                          >
                            {t("ctaBecomePartner")} <ArrowRight className="h-4 w-4" />
                          </button>
                        )}

                        {!isApproved && (
                          <button
                            onClick={() => router.push("/")}
                            className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold hover:bg-white"
                          >
                            {t("ctaExploreCatalog")}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick feature chips */}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Chip
                  icon={<Percent className="h-4 w-4" />}
                  title={t("chipFairTitle")}
                  desc={t("chipFairDesc")}
                />
                <Chip
                  icon={<Gift className="h-4 w-4" />}
                  title={t("chipGlobalTitle")}
                  desc={t("chipGlobalDesc")}
                />
                <Chip
                  icon={<LineChart className="h-4 w-4" />}
                  title={t("chipLiveTitle")}
                  desc={t("chipLiveDesc")}
                />
                <Chip
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title={t("chipAutoTitle")}
                  desc={t("chipAutoDesc")}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Wave divider */}
        <div className="relative h-10 -mt-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white to-transparent [mask-image:radial-gradient(120%_50%_at_50%_-10%,black,transparent)]" />
        </div>

        {/* A. Steps */}
        <section className="mx-auto max-w-6xl px-4">
          <h2 className="mb-3 text-lg font-semibold">{t("howItWorks")}</h2>

          {/* Country-aware explainer video. Renders only when one is
              configured — visitor's country wins, falling back to the
              admin-selected default country. Click-to-play (no autoplay)
              so we don't surprise users; first frame is the poster.
              Responsive sizing: full-bleed on mobile, capped width on
              tablet+ to keep the line length of the steps below readable
              underneath. */}
          {howItWorksVideoUrl && (
            <div className="mb-6 mx-auto w-full max-w-3xl">
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md">
                <video
                  key={howItWorksVideoUrl}
                  src={howItWorksVideoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Step
              n={1}
              title={t("stepApplyTitle")}
              desc={t("stepApplyDesc")}
              color="bg-rose-100 text-rose-700"
            />
            <Step
              n={2}
              title={t("stepApprovalTitle")}
              desc={t("stepApprovalDesc")}
              color="bg-amber-100 text-amber-700"
            />
            <Step
              n={3}
              title={t("stepShareTitle")}
              desc={t("stepShareDesc")}
              color="bg-sky-100 text-sky-700"
            />
            <Step
              n={4}
              title={t("stepEarnTitle")}
              desc={t("stepEarnDesc")}
              color="bg-emerald-100 text-emerald-700"
            />
          </ol>
        </section>

        {/* Pending ribbon */}
        {!isApproved && !statusLoading && status === "pending" && (
          <section className="mx-auto mt-4 max-w-6xl px-4">
            <div className="rounded-2xl border bg-amber-50 p-4 text-amber-900">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4" />
                {t("pendingReceived")}
              </div>
              <p className="mt-1 text-xs">
                {t("pendingSubmittedOn", {
                  when: requestedAt
                    ? new Date(requestedAt).toLocaleString()
                    : t("pendingMissingDate"),
                })}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                <span className="rounded-lg bg-white/70 px-2 py-1">
                  {t("pendingPillSubmitted")}
                </span>
                <span className="rounded-lg bg-white/70 px-2 py-1">
                  {t("pendingPillReviewing")}
                </span>
                <span className="rounded-lg bg-white/70 px-2 py-1">
                  {t("pendingPillDecision")}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* B. Trust stats */}
        <section className="mx-auto mt-6 max-w-6xl px-4">
          <div className="rounded-2xl border p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat
                icon={<Users2 className="h-5 w-5" />}
                label={t("statCreatorsLabel")}
                value={t("statCreatorsValue")}
              />
              <Stat
                icon={<Star className="h-5 w-5" />}
                label={t("statRatingLabel")}
                value={t("statRatingValue")}
              />
              <Stat
                icon={<BadgeCheck className="h-5 w-5" />}
                label={t("statApprovalLabel")}
                value={t("statApprovalValue")}
              />
            </div>
          </div>
        </section>

        {/* D. Benefits grid */}
        <section className="mx-auto mt-6 max-w-6xl px-4">
          <h2 className="mb-3 text-lg font-semibold">{t("benefitsHeading")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card
              icon={<BadgeCheck className="h-5 w-5" />}
              title={t("benefitInnovationsTitle")}
              desc={t("benefitInnovationsDesc")}
              gradient="from-rose-100 to-fuchsia-50"
            />
            <Card
              icon={<LineChart className="h-5 w-5" />}
              title={t("benefitInsightsTitle")}
              desc={t("benefitInsightsDesc")}
              gradient="from-sky-100 to-indigo-50"
            />
            <Card
              icon={<ShieldCheck className="h-5 w-5" />}
              title={t("benefitHasslefreeTitle")}
              desc={t("benefitHasslefreeDesc")}
              gradient="from-emerald-100 to-teal-50"
            />
          </div>
        </section>

        {/* E. FAQ */}
        <section className="mx-auto mt-6 max-w-6xl px-4 pb-16">
          <h2 className="mb-3 text-lg font-semibold">{t("faqHeading")}</h2>
          <div className="rounded-2xl border">
            <FaqItem
              q={t("faqCapQuestion")}
              a={t("faqCapAnswer")}
            />
            <FaqItem
              q={t("faqGlobalQuestion")}
              a={t("faqGlobalAnswer")}
            />
            <FaqItem
              q={t("faqPayoutsQuestion")}
              a={t("faqPayoutsAnswer")}
            />
          </div>
        </section>

        {/* Application modal */}
        {open && !isApproved && status !== "pending" && (
          <div
            aria-modal="true"
            role="dialog"
            className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
            onClick={() => setOpen(false)}
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
                <h3 className="text-lg font-semibold">{t("modalTitle")}</h3>
                <button
                  className="rounded p-1 hover:bg-neutral-100"
                  onClick={() => setOpen(false)}
                  aria-label={t("modalClose")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-3 text-sm text-neutral-600">
                {t("modalIntro")}
              </p>

              <label className="mb-1 block text-xs font-medium">{t("modalNameLabel")}</label>
              <input
                className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder={t("modalNamePlaceholder")}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
              <label className="mb-1 block text-xs font-medium">{t("modalNoteLabel")}</label>
              <textarea
                rows={4}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder={t("modalNotePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? t("modalSubmitting") : t("modalSubmit")}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
                >
                  {t("modalCancel")}
                </button>
              </div>

              <p className="mt-3 text-[11px] text-neutral-500">
                {t("modalLegal")}
              </p>
            </div>
          </div>
        )}

        {/* Inline form (fallback). Auth-only — anon visitors get one
            CTA in the hero ("Become a Partner") which redirects to
            sign-in; rendering a second long application form on the
            same page would be both redundant and confusing because
            its submit handler would also redirect to sign-in. */}
        {isAuthenticated &&
          !isApproved &&
          !statusLoading &&
          (status === "none" || status === "rejected") &&
          !open && (
            <section className="mx-auto mt-2 max-w-6xl px-4 pb-16">
              <div className="rounded-2xl border p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">{t("inlineApplyHeading")}</h2>
                  <button
                    onClick={() => setOpen(true)}
                    className="text-sm font-medium underline"
                  >
                    {t("inlineOpenAsModal")}
                  </button>
                </div>
                <form onSubmit={submit} className="mt-4 grid gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      {t("modalNameLabel")}
                    </label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder={t("modalNamePlaceholder")}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">
                      {t("modalNoteLabel")}
                    </label>
                    <textarea
                      rows={4}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("inlineNotePlaceholder")}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {submitting ? t("modalSubmitting") : t("modalSubmit")}
                  </button>
                </form>
              </div>
            </section>
          )}

        {(msg || err) && (
          <div
            className="fixed bottom-3 left-0 right-0 mx-auto w-[92%] max-w-md rounded-lg border p-3 text-sm shadow"
            style={{
              background: msg ? "#ecfdf5" : "#fef2f2",
              borderColor: msg ? "#a7f3d0" : "#fecaca",
              color: msg ? "#065f46" : "#991b1b",
            }}
          >
            {msg || err}
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}

/* ---------- Atoms ---------- */
function Chip({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-3">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-white p-1.5 text-rose-700">{icon}</div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <p className="mt-1 text-xs text-neutral-700">{desc}</p>
    </div>
  );
}

function Step({
  n,
  title,
  desc,
  color,
}: {
  n: number;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <li className="relative rounded-2xl border bg-white p-4 shadow-sm">
      <div
        className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full ${color} text-xs font-bold`}
      >
        {n}
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs text-neutral-600">{desc}</p>
    </li>
  );
}

function Card({
  icon,
  title,
  desc,
  gradient,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  gradient: string;
}) {
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${gradient} p-4`}>
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-white/70 p-1.5">{icon}</div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <p className="mt-1 text-xs text-neutral-700">{desc}</p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-4">
      <div className="rounded-md bg-neutral-50 p-2">{icon}</div>
      <div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-xs text-neutral-600">{label}</div>
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="group border-b last:border-none"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-neutral-500" />
          {q}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-neutral-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </summary>
      <div className="px-4 pb-4 text-xs text-neutral-600">{a}</div>
    </details>
  );
}
