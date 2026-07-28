"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Sparkles,
  Camera,
  ShieldCheck,
  Loader2,
  ScanFace,
  BarChart3,
  ShoppingBag,
  Wand2,
  LineChart,
  Lock,
  Clock,
  Smartphone,
  ChevronDown,
  ArrowRight,
  Star,
} from "lucide-react";
import { CONCERN_INFO } from "@/lib/integrations/skinConcerns";
import { KCoin } from "@/components/k-points/KCoin";

type Status =
  | { authed: false }
  | {
      authed: true;
      state:
        | { status: "ready"; remaining: number }
        | { status: "reserved"; grantId: string }
        | { status: "none" };
      lastAnalysisId: string | null;
      pendingRequest: boolean;
      pointsCost?: number;
      pointsBalance?: number;
    };

const STEPS = [
  {
    icon: Camera,
    title: "Snap a selfie",
    body: "Front-facing, in good light — best on your phone.",
  },
  {
    icon: ScanFace,
    title: "AI reads your skin",
    body: "Perfect Corp AI analyses 12+ signals in seconds.",
  },
  {
    icon: BarChart3,
    title: "See your scores",
    body: "Clear scores and severity for every concern.",
  },
  {
    icon: ShoppingBag,
    title: "Shop your routine",
    body: "Products matched to what your skin actually needs.",
  },
];

const BENEFITS = [
  {
    icon: Wand2,
    title: "Personalised to you",
    body: "Recommendations mapped to your specific concerns — no guesswork.",
  },
  {
    icon: LineChart,
    title: "Track your progress",
    body: "Re-analyse any time and compare, before-and-after, to see what's working.",
  },
  {
    icon: Sparkles,
    title: "K-beauty, curated",
    body: "Matched from MadeNKorea's edit of Korean skincare you can trust.",
  },
  {
    icon: Lock,
    title: "Private by design",
    body: "Your photo is used only to run the analysis and is never stored.",
  },
];

const FAQ = [
  {
    q: "How accurate is it?",
    a: "It's powered by Perfect Corp's clinically-informed AI — the same technology behind leading beauty brands. It's cosmetic guidance to help you focus your routine, not a medical diagnosis.",
  },
  {
    q: "Is my photo stored?",
    a: "No. Your selfie is used only to run the analysis and is then discarded. We keep only your results, saved to your account.",
  },
  {
    q: "How many analyses do I get?",
    a: "Your first analysis is free. Need another? Request access and we'll enable one for you.",
  },
  {
    q: "Do I need an account?",
    a: "Yes — a free MadeNKorea account, so your results are saved and you can track your progress over time.",
  },
  {
    q: "What do I need?",
    a: "Any phone with a camera and good, even lighting. On desktop we'll hand you over to your phone with a quick scan.",
  },
];

// Placeholder faces — swap for MadeNKorea brand photography later.
const AVATARS = [
  "https://randomuser.me/api/portraits/thumb/women/44.jpg",
  "https://randomuser.me/api/portraits/thumb/men/32.jpg",
  "https://randomuser.me/api/portraits/thumb/women/68.jpg",
  "https://randomuser.me/api/portraits/thumb/men/75.jpg",
  "https://randomuser.me/api/portraits/thumb/women/90.jpg",
];

// Hero model (Pexels). 4:5 crop to match the card, served sharp.
const HERO_FACE =
  "https://images.pexels.com/photos/19999466/pexels-photo-19999466.jpeg?auto=compress&cs=tinysrgb&w=900&h=1120&fit=crop";

const TESTIMONIALS = [
  {
    name: "Ananya R.",
    loc: "Mumbai",
    avatar: "https://randomuser.me/api/portraits/women/65.jpg",
    quote:
      "I finally understood why my skin felt so dry — the routine it suggested actually worked.",
  },
  {
    name: "Rahul M.",
    loc: "Bengaluru",
    avatar: "https://randomuser.me/api/portraits/men/46.jpg",
    quote:
      "Took a selfie, got real scores in seconds. The product picks were spot on.",
  },
  {
    name: "Sana K.",
    loc: "Delhi",
    avatar: "https://randomuser.me/api/portraits/women/12.jpg",
    quote:
      "Love that I can re-scan and compare — my pores score actually went up in a month!",
  },
];

// A few key concerns to feature prominently (the rest render in the grid).
const FEATURED = [
  "acne",
  "wrinkles",
  "pores",
  "moisture",
  "dark_circle",
  "redness",
  "oiliness",
  "radiance",
  "firmness",
  "texture",
  "eye_bag",
  "age_spot",
];

// Highlighted "next step" styling for the mobile sticky CTA — brand gradient +
// a soft breathing glow (mk-cta-pulse, see globals.css) so it stands out from
// the white bar and reads as the obvious next action.
const STICKY_CTA_CLASS =
  "w-full mk-cta-pulse bg-gradient-to-r from-rose-500 to-violet-600 font-semibold text-white shadow-lg shadow-rose-500/30 hover:from-rose-600 hover:to-violet-700";

export default function SkinAnalyzerPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [starting, setStarting] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/skin/status", { cache: "no-store" });
      setStatus(await r.json());
    } catch {
      setStatus({ authed: false });
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function start() {
    setStarting(true);
    try {
      const r = await fetch("/api/skin/start", { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.message || "Could not start the analysis.");
        setStarting(false);
        return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      toast.error("Something went wrong. Please try again.");
      setStarting(false);
    }
  }

  async function requestAccess() {
    setRequesting(true);
    try {
      const r = await fetch("/api/skin/request-access", { method: "POST" });
      const data = await r.json();
      if (!r.ok) toast.error(data.message || "Could not submit your request.");
      else {
        toast.success(
          data.alreadyPending
            ? "Your request is already pending review."
            : "Request submitted — we'll enable another analysis for you soon.",
        );
        await load();
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRequesting(false);
    }
  }

  // NOTE: these are plain render helpers, not components. Declaring a component
  // inside another component gives it a new function identity on every render,
  // so React treats it as a different type and unmounts/remounts the whole
  // subtree instead of updating it — which tears down nodes it adopted during
  // hydration and crashes in unmountHoistable.
  function renderCta() {
    if (!status) {
      return (
        <Button disabled size="lg" className="w-full">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Button>
      );
    }
    if (!status.authed) {
      return (
        <div className="space-y-2">
          <Button asChild size="lg" className="w-full">
            <Link href="/auth/login?redirect=/skin-analyzer">
              <Camera className="mr-2 h-4 w-4" /> Log in & analyze your skin
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            New here?{" "}
            <Link
              href="/auth/register?redirect=/skin-analyzer"
              className="font-medium underline"
            >
              Create a free account
            </Link>
          </p>
        </div>
      );
    }

    const { state, lastAnalysisId, pendingRequest } = status;
    const cost = status.pointsCost ?? 0;
    const balance = status.pointsBalance ?? 0;
    const gated = cost > 0;
    const viewLast = lastAnalysisId ? (
      <Button asChild variant="ghost" size="sm" className="w-full">
        <Link href="/account/skin-analysis">View your past results</Link>
      </Button>
    ) : null;

    if (state.status === "ready" || state.status === "reserved") {
      return (
        <div className="space-y-2">
          <Button
            onClick={start}
            disabled={starting}
            size="lg"
            className="w-full"
          >
            {starting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            {state.status === "reserved"
              ? "Continue your analysis"
              : gated
                ? "Analyze my skin"
                : "Analyze my skin — free"}
          </Button>
          {viewLast}
        </div>
      );
    }

    // Points-gated: no free scan. Spend K-Points to unlock one, or top up.
    if (gated) {
      const canAfford = balance >= cost;
      return (
        <div className="space-y-2">
          <Button
            onClick={canAfford ? start : undefined}
            disabled={starting || !canAfford}
            size="lg"
            className="w-full"
          >
            {starting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <KCoin className="mr-2 h-4 w-4" />
            )}
            {`Analyze my skin — ${cost.toLocaleString()} K-Points`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {canAfford
              ? `You have ${balance.toLocaleString()} K-Points`
              : `You have ${balance.toLocaleString()} — you need ${cost.toLocaleString()}`}
          </p>
          {!canAfford ? (
            <Button asChild variant="outline" size="lg" className="w-full">
              <Link href="/account/k-points">Get K-Points</Link>
            </Button>
          ) : null}
          {viewLast}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <p className="rounded-lg bg-muted/60 p-3 text-center text-sm text-muted-foreground">
          You&apos;ve used your free analysis. Request access for another one.
        </p>
        <Button
          onClick={requestAccess}
          disabled={requesting || pendingRequest}
          size="lg"
          className="w-full"
        >
          {requesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {pendingRequest ? "Request pending review" : "Request another analysis"}
        </Button>
        {viewLast}
      </div>
    );
  }

  // Compact single-button CTA for the mobile sticky bar.
  function renderMobileStickyCta() {
    if (!status) {
      return (
        <Button disabled className="w-full">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Button>
      );
    }
    if (!status.authed) {
      return (
        <Button asChild className={STICKY_CTA_CLASS}>
          <Link href="/auth/login?redirect=/skin-analyzer">
            <Camera className="mr-2 h-4 w-4" /> Log in & analyze
          </Link>
        </Button>
      );
    }
    const { state, pendingRequest } = status;
    const cost = status.pointsCost ?? 0;
    const balance = status.pointsBalance ?? 0;
    const gated = cost > 0;
    if (state.status === "ready" || state.status === "reserved") {
      return (
        <Button onClick={start} disabled={starting} className={STICKY_CTA_CLASS}>
          {starting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Camera className="mr-2 h-4 w-4" />
          )}
          {state.status === "reserved"
            ? "Continue analysis"
            : gated
              ? "Analyze my skin"
              : "Analyze my skin — free"}
        </Button>
      );
    }
    if (gated) {
      const canAfford = balance >= cost;
      if (!canAfford) {
        return (
          <Button asChild className={STICKY_CTA_CLASS}>
            <Link href="/account/k-points">
              <KCoin className="mr-2 h-4 w-4" /> Get K-Points
            </Link>
          </Button>
        );
      }
      return (
        <Button onClick={start} disabled={starting} className={STICKY_CTA_CLASS}>
          {starting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <KCoin className="mr-2 h-4 w-4" />
          )}
          {`Analyze — ${cost.toLocaleString()} K-Points`}
        </Button>
      );
    }
    return (
      <Button
        onClick={requestAccess}
        disabled={requesting || pendingRequest}
        className={pendingRequest ? "w-full" : STICKY_CTA_CLASS}
      >
        {pendingRequest ? "Request pending review" : "Request another analysis"}
      </Button>
    );
  }

  return (
    <CustomerLayout>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-rose-50 via-white to-white">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-rose-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-32 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />
        <div className="relative mx-auto flex max-w-6xl flex-col px-4 py-12 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-20">
          <div className="order-2 lg:order-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white/70 px-3 py-1 text-xs font-medium text-rose-700 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> AI Skin Analysis · powered by
              Perfect Corp
            </span>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              Your skin,{" "}
              <span className="bg-gradient-to-r from-rose-500 to-violet-500 bg-clip-text text-transparent">
                analysed in seconds
              </span>
            </h1>
            <p className="mt-4 max-w-md text-base text-muted-foreground">
              Snap one selfie. Our AI reads 12+ skin signals — acne, hydration,
              pores, dark circles and more — then matches you with a K-beauty
              routine made for your skin.
            </p>

            <div className="mt-7 max-w-sm">
              {renderCta()}
              <p className="mt-3 text-center text-xs text-muted-foreground lg:text-left">
                1 free analysis · results saved to your account
              </p>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <Trust icon={Clock} label="~30 seconds" />
              <Trust icon={Lock} label="Photo never stored" />
              <Trust icon={Smartphone} label="Works on any phone" />
            </div>

            <div className="mt-6 flex items-center gap-3">
              <div className="flex -space-x-2">
                {AVATARS.map((a) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={a}
                    src={a}
                    alt=""
                    className="h-8 w-8 rounded-full border-2 border-white object-cover shadow-sm"
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">10,000+</span>{" "}
                skin scans and counting
              </p>
            </div>
          </div>

          <div className="order-1 mb-8 lg:order-2 lg:mb-0">
            <FaceAnalysisCard />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <SectionHeading eyebrow="How it works" title="From selfie to routine, in under a minute" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              className="relative rounded-2xl border bg-card p-5 shadow-sm"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="text-xs font-semibold text-rose-500">
                Step {i + 1}
              </div>
              <div className="mt-0.5 font-medium">{s.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What we analyze ── */}
      <section className="bg-muted/30 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="Deep analysis"
            title="We read 12+ signals in your skin"
            sub="Every concern gets its own score and severity — so you know exactly where to focus."
          />
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {FEATURED.filter((k) => CONCERN_INFO[k]).map((k) => (
              <div
                key={k}
                className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-gradient-to-r from-rose-400 to-violet-400" />
                  <span className="text-sm font-medium">
                    {CONCERN_INFO[k]?.name}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {CONCERN_INFO[k]?.description}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Plus your skin type, estimated skin age and an overall skin score.
          </p>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <SectionHeading eyebrow="Why it's different" title="More than a score" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-rose-100 to-violet-100 text-rose-600">
                <b.icon className="h-5 w-5" />
              </div>
              <div className="font-medium">{b.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Privacy band ── */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="flex flex-col items-start gap-4 rounded-3xl border bg-gradient-to-br from-emerald-50 to-white p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-semibold">Your photo never sticks around</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Capture happens in the moment, the image is used only to run the
              analysis, and we keep just your results — saved to your account so
              you can track progress over time.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto max-w-3xl px-4 pb-16">
        <SectionHeading eyebrow="Good to know" title="Questions, answered" />
        <div className="mt-8 divide-y rounded-2xl border bg-card px-5">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="bg-muted/30 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeading
            eyebrow="Loved by our community"
            title="Real skin, real results"
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border bg-card p-5 shadow-sm"
              >
                <div className="flex gap-0.5 text-amber-400">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-3 text-sm leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-4 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.avatar}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.loc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-rose-500 to-violet-600">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(circle_at_20%_20%,white,transparent_40%)]" />
        <div className="relative mx-auto max-w-2xl px-4 py-16 text-center text-white">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Ready to meet your skin?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/85">
            Your first analysis is free. See your scores, understand your
            concerns, and get a routine made for you.
          </p>
          <div className="mx-auto mt-7 max-w-sm rounded-2xl bg-white p-4 text-foreground shadow-xl">
            {renderCta()}
          </div>
        </div>
      </section>

      {/* spacer so page content clears the mobile sticky bar */}
      <div className="h-16 lg:hidden" aria-hidden />

      {/* Mobile sticky CTA — always reachable */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-3 pt-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mr-16">
          {renderMobileStickyCta()}
        </div>
      </div>
    </CustomerLayout>
  );
}

function Trust({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-4 w-4 text-rose-400" />
      {label}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? (
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-500">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {sub ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

// Hero visual: a real face with a subtle, natural scan overlay.
function FaceAnalysisCard() {
  return (
    <div className="relative mx-auto max-w-sm">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border-4 border-white bg-muted shadow-2xl shadow-rose-500/15">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_FACE}
          alt="AI skin analysis"
          className="h-full w-full object-cover"
        />
        {/* gentle vignette so overlays read on any photo */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/30" />

        {/* one soft scanning line */}
        <div className="mk-scanline pointer-events-none absolute inset-x-0 h-px bg-white/90 shadow-[0_0_18px_4px_rgba(255,255,255,0.5)]" />

        {/* analysis points */}
        <ScanDot top="30%" left="35%" />
        <ScanDot top="33%" left="65%" delay="0.9s" />
        <ScanDot top="58%" left="50%" delay="1.8s" />

        {/* overall score badge */}
        <div className="absolute left-3 top-3 rounded-2xl bg-white/85 px-3 py-2 shadow-lg backdrop-blur">
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Overall
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-emerald-600">82</span>
            <span className="text-[10px] text-muted-foreground">/ 100 · Good</span>
          </div>
        </div>

        {/* live badge */}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-1 text-[10px] font-semibold text-white shadow">
          <Sparkles className="h-3 w-3" /> Analyzing
        </span>

        {/* concern chips */}
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5">
          <FaceChip label="Hydration" score={72} tone="bg-lime-500" />
          <FaceChip label="Pores" score={58} tone="bg-amber-500" />
          <FaceChip label="Dark circles" score={44} tone="bg-red-500" />
        </div>
      </div>

    </div>
  );
}

function ScanDot({
  top,
  left,
  delay = "0s",
}: {
  top: string;
  left: string;
  delay?: string;
}) {
  return (
    <span
      className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-white shadow ring-2 ring-rose-400/80"
      style={{ top, left, animationDelay: delay }}
    />
  );
}

function FaceChip({
  label,
  score,
  tone,
}: {
  label: string;
  score: number;
  tone: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      {label}
      <span className="tabular-nums opacity-80">{score}</span>
    </span>
  );
}
