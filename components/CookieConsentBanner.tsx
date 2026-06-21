"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCookieConsent } from "@/lib/contexts/CookieConsentContext";

/**
 * Bottom-anchored cookie consent banner. Shows on first visit until the
 * user picks one of three actions: Accept all, Reject all, or Customize
 * (opens the preferences dialog). Once a decision is recorded the
 * banner doesn't reappear unless the user opens "Manage cookies" from
 * the footer to revisit.
 */
export function CookieConsentBanner() {
  const t = useTranslations("cookieConsent");
  const {
    consent,
    needsDecision,
    acceptAll,
    rejectAll,
    setConsent,
    preferencesOpen,
    openPreferences,
    closePreferences,
  } = useCookieConsent();

  // Local mirror of the form state inside the dialog. First-time
  // visitors get Functional + Analytics ON by default (a generally
  // user-friendly stance), but Marketing OFF — marketing pixels are the
  // highest-risk category for consent claims and most regulators expect
  // an explicit opt-in. Returning users see whatever they previously
  // saved.
  const [draft, setDraft] = useState({
    analytics: consent.analytics ?? true,
    marketing: consent.marketing ?? false,
    functional: consent.functional ?? true,
  });

  // Soft entrance — wait for either a dwell-time OR a configured
  // number of scroll bursts, whichever comes first, before showing
  // the banner. Reduces mobile intrusion on first paint without
  // delaying anything legally consequential (no cookies are set until
  // the user opts in either way; this only affects the banner's
  // visibility).
  //
  // Both knobs (dwell seconds + scroll bursts) are admin-configurable
  // via Settings → General → Cookie consent banner. Defaults: 7s,
  // 1 scroll. We fetch them from a public, CDN-cached endpoint on
  // mount; the defaults cover the network-blip case.
  //
  // A "scroll burst" = one continuous scroll session. We debounce
  // ~500ms — so a long fast scroll counts as one burst, while
  // scroll-pause-scroll counts as two. This is much more stable than
  // counting raw scroll events (one wheel-tick varies wildly across
  // mouse / trackpad / touch).
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!needsDecision) return;
    let cancelled = false;
    let timer: number | null = null;
    let burstCount = 0;
    let scrollThreshold = 1;
    let burstTimer: number | null = null;
    let inBurst = false;

    const arm = () => {
      if (cancelled) return;
      setArmed(true);
    };

    const onScroll = () => {
      if (cancelled || armed) return;
      if (window.scrollY <= 0) return;
      if (!inBurst) {
        inBurst = true;
        burstCount += 1;
        if (burstCount >= scrollThreshold) {
          arm();
          return;
        }
      }
      // Continue the current burst — reset the debounce window.
      if (burstTimer != null) window.clearTimeout(burstTimer);
      burstTimer = window.setTimeout(() => {
        inBurst = false;
        burstTimer = null;
      }, 500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Default timer kicks in immediately so the banner never waits
    // longer than 7s while the config request is still in flight.
    timer = window.setTimeout(arm, 7000);

    fetch("/api/site-config/cookie-consent", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        const v = Number(body?.delaySeconds);
        if (Number.isFinite(v) && v >= 1 && v <= 60) {
          if (timer != null) window.clearTimeout(timer);
          timer = window.setTimeout(arm, v * 1000);
        }
        const s = Number(body?.scrollThreshold);
        if (Number.isFinite(s) && s >= 1 && s <= 20) {
          scrollThreshold = Math.floor(s);
        }
      })
      .catch(() => {
        /* keep defaults */
      });

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      if (burstTimer != null) window.clearTimeout(burstTimer);
      window.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsDecision]);

  const handleOpenPrefs = () => {
    setDraft({
      analytics: consent.analytics ?? true,
      marketing: consent.marketing ?? false,
      functional: consent.functional ?? true,
    });
    openPreferences();
  };

  const handleSave = () => {
    setConsent({
      analytics: draft.analytics,
      marketing: draft.marketing,
      functional: draft.functional,
    });
    closePreferences();
  };

  return (
    <>
      {needsDecision && armed && (
        <div
          role="dialog"
          aria-label={t("ariaLabel")}
          // Bigger, more visible card. Centered max-width so it doesn't
          // stretch edge-to-edge on huge displays. z-40 sits above page
          // content but below shadcn Dialog (z-50). Mobile safe-area
          // inset keeps the banner above the iOS home bar.
          //
          // Slide-up entrance (animate-in slide-in-from-bottom) — the
          // banner is gated behind `armed`, which is set after 3s OR
          // first scroll, so the entrance is intentional rather than
          // an abrupt first-paint popover.
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-primary bg-background shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-500"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="container mx-auto py-5 sm:py-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="rounded-full bg-muted p-2 flex-shrink-0">
                <Cookie className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold mb-1">{t("title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("body")}{" "}
                  <Link
                    href="/policies/cookies"
                    className="underline text-foreground"
                  >
                    {t("readPolicy")}
                  </Link>
                  .
                </p>
              </div>
            </div>
            {/* Buttons: full-width column on mobile (one per row, big tap
                targets), inline on desktop. Order is Customize (least
                committal) → Reject all → Accept all (primary). */}
            <div className="flex flex-col sm:flex-row gap-2 lg:flex-nowrap shrink-0 w-full lg:w-auto">
              <Button
                variant="outline"
                onClick={handleOpenPrefs}
                className="w-full sm:w-auto"
              >
                {t("customize")}
              </Button>
              <Button
                variant="outline"
                onClick={rejectAll}
                className="w-full sm:w-auto"
                // "Only necessary" instead of "Reject all" — the latter
                // implied the app might stop working, which isn't true
                // (necessary cookies stay on regardless). Same action
                // under the hood: rejectAll() keeps Necessary on and
                // turns Functional / Analytics / Marketing off.
                title={t("onlyNecessaryTitle")}
              >
                {t("onlyNecessary")}
              </Button>
              <Button onClick={acceptAll} className="w-full sm:w-auto">
                {t("acceptAll")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={preferencesOpen}
        onOpenChange={(o) => (o ? handleOpenPrefs() : closePreferences())}
      >
        <DialogContent
          // max-h + overflow-y so the close button at top-right stays
          // visible on mobile (where DialogContent + system bars together
          // were exceeding 100dvh and clipping the top of the dialog).
          className="max-w-lg max-h-[90dvh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{t("prefsTitle")}</DialogTitle>
            <DialogDescription>{t("prefsDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <PrefRow
              title={t("rowNecessary")}
              description={t("rowNecessaryDesc")}
              checked
              disabled
              onChange={() => {}}
            />
            <PrefRow
              title={t("rowFunctional")}
              description={t("rowFunctionalDesc")}
              checked={draft.functional}
              onChange={(v) => setDraft((d) => ({ ...d, functional: v }))}
            />
            <PrefRow
              title={t("rowAnalytics")}
              description={t("rowAnalyticsDesc")}
              checked={draft.analytics}
              onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
            />
            <PrefRow
              title={t("rowMarketing")}
              description={t("rowMarketingDesc")}
              checked={draft.marketing}
              onChange={(v) => setDraft((d) => ({ ...d, marketing: v }))}
            />
          </div>

          {/* Action row: stacked full-width on mobile, inline on desktop.
              Save is the primary; "Only necessary" / Accept all are
              quick shortcuts that bypass the toggles. "Only necessary"
              keeps Necessary cookies on (the site needs them) and turns
              everything else off. */}
          <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap gap-2 sm:justify-end pt-2">
            <Button
              variant="outline"
              onClick={rejectAll}
              className="w-full sm:w-auto"
              title={t("onlyNecessaryTitle")}
            >
              {t("onlyNecessary")}
            </Button>
            <Button
              variant="outline"
              onClick={acceptAll}
              className="w-full sm:w-auto"
            >
              {t("acceptAll")}
            </Button>
            <Button onClick={handleSave} className="w-full sm:w-auto">
              {t("save")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("fullListPrefix")}{" "}
            <Link href="/policies/cookies" className="underline">
              {t("cookiePolicyLink")}
            </Link>
            .
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PrefRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <Label className="text-sm font-medium">{title}</Label>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={title}
      />
    </div>
  );
}
