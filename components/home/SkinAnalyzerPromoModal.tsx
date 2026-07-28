"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScanFace, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Home-page marketing pop-up for the AI Skin Analyzer. Angle: "stop guessing
 * — let us show you the products your skin actually needs."
 *
 * Shows on EVERY home load. The ONLY thing that suppresses it permanently is
 * the explicit "Don't show again" button — any other close (X, Esc, overlay,
 * "Maybe later") lets it reappear on the next load.
 *
 * The header shows a face with a live "analysing" overlay (scan line + pulsing
 * points), reusing the same visual language as the skin-analyzer hero card.
 *
 * Copy is intentionally English-only to match the skin-analyzer feature itself
 * (that flow is not yet localized). Localize together when the analyzer is.
 */

const DISMISS_KEY = "mik_skin_promo_dismissed"; // set only by "Don't show again"
const SHOW_DELAY_MS = 3000; // let the page settle (and any cookie banner clear)

// Same model shot the skin-analyzer hero uses — keeps the promo on-brand.
const HERO_FACE =
  "https://images.pexels.com/photos/19999466/pexels-photo-19999466.jpeg?auto=compress&cs=tinysrgb&w=800&h=600&fit=crop";

const BULLETS = [
  "Products matched to your real concerns",
  "12+ skin signals read in seconds",
  "See your scores, then shop your routine",
];

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

export function SkinAnalyzerPromoModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only permanently-dismissed users are skipped; everyone else sees it.
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* private mode / storage blocked → just show it */
    }
    const t = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Permanent opt-out — the only path that persists.
  const dontShowAgain = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md [&>button]:z-10 [&>button]:text-white [&>button]:opacity-90 [&>button]:hover:opacity-100">
        <DialogTitle className="sr-only">
          Analyze your skin with AI
        </DialogTitle>

        {/* ── Face banner with live analysing overlay ── */}
        <div className="relative h-48 w-full overflow-hidden bg-rose-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HERO_FACE}
            alt="AI skin analysis"
            className="h-full w-full object-cover object-top"
          />

          {/* brand tint + bottom gradient so the headline reads on any photo */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-violet-950/90 via-rose-900/25 to-rose-500/15" />

          {/* one soft scanning line sweeping the face */}
          <div className="mk-scanline pointer-events-none absolute inset-x-0 h-px bg-white/90 shadow-[0_0_18px_4px_rgba(255,255,255,0.5)]" />

          {/* pulsing analysis points */}
          <ScanDot top="34%" left="34%" />
          <ScanDot top="38%" left="66%" delay="0.9s" />
          <ScanDot top="60%" left="50%" delay="1.8s" />

          {/* live "analysing" badge */}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-1 text-[10px] font-semibold text-white shadow">
            <Sparkles className="h-3 w-3 animate-pulse" /> Analyzing…
          </span>

          {/* eyebrow + headline overlaid on the image */}
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur">
              <Sparkles className="h-3 w-3" /> AI Skin Analysis
            </span>
            <h2 className="mt-2 text-2xl font-semibold leading-tight drop-shadow-sm">
              Stop guessing what your skin needs
            </h2>
          </div>
        </div>

        {/* ── Value copy + CTA ── */}
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground">
            Take a 30-second selfie scan and we&apos;ll show you the exact
            K-beauty products your skin actually needs — matched to your
            concerns.
          </p>

          <ul className="mt-4 space-y-2.5 text-sm">
            {BULLETS.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>

          <Button
            asChild
            size="lg"
            className="mt-5 w-full bg-gradient-to-r from-rose-500 to-violet-600 font-semibold text-white shadow-lg shadow-rose-500/30 hover:from-rose-600 hover:to-violet-700"
          >
            <Link href="/skin-analyzer">
              <ScanFace className="mr-2 h-4 w-4" /> Analyze my skin now
            </Link>
          </Button>

          {/* "Maybe later" closes for now (reappears next load); "Don't show
              again" is the only permanent opt-out. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Maybe later
            </button>
            <button
              type="button"
              onClick={dontShowAgain}
              className="text-xs text-muted-foreground/70 underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Don&apos;t show again
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
