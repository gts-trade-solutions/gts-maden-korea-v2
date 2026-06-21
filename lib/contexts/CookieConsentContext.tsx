"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// What the user has opted into. `null` on a category means "not yet
// decided" — used to detect first-visit so the banner shows.
export type CookieConsent = {
  necessary: true; // always on, can't be disabled
  analytics: boolean | null;
  marketing: boolean | null;
  functional: boolean | null;
};

const STORAGE_KEY = "mik_cookie_consent_v1";

const DEFAULT_PENDING: CookieConsent = {
  necessary: true,
  analytics: null,
  marketing: null,
  functional: null,
};

const ALL_ACCEPTED: CookieConsent = {
  necessary: true,
  analytics: true,
  marketing: true,
  functional: true,
};

const ALL_REJECTED: CookieConsent = {
  necessary: true,
  analytics: false,
  marketing: false,
  functional: false,
};

type CookieConsentContextValue = {
  consent: CookieConsent;
  /**
   * True when the user hasn't decided yet. Banner uses this to know
   * whether to render itself.
   */
  needsDecision: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  setConsent: (partial: Partial<CookieConsent>) => void;
  /**
   * Programmatically open the preferences dialog (e.g. "Manage cookies"
   * link in the footer). Returns to false when the dialog is closed.
   */
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

function readPersisted(): CookieConsent {
  if (typeof window === "undefined") return DEFAULT_PENDING;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PENDING;
    const parsed = JSON.parse(raw);
    return {
      necessary: true,
      analytics:
        typeof parsed?.analytics === "boolean" ? parsed.analytics : null,
      marketing:
        typeof parsed?.marketing === "boolean" ? parsed.marketing : null,
      functional:
        typeof parsed?.functional === "boolean" ? parsed.functional : null,
    };
  } catch {
    return DEFAULT_PENDING;
  }
}

function persist(c: CookieConsent) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        analytics: c.analytics,
        marketing: c.marketing,
        functional: c.functional,
        decidedAt: new Date().toISOString(),
        v: 1,
      })
    );
  } catch {
    // localStorage might be unavailable (privacy mode); fail silent.
  }
}

// Try to mirror the analytics consent into the user's profile so it
// follows them across devices. Best-effort.
async function syncProfile(c: CookieConsent) {
  try {
    if (c.analytics === null) return;
    // Was a browser supabase.auth.getSession() + profiles update — null session
    // under NextAuth. Route through the seam endpoint (no-op for guests).
    await fetch("/api/me/consent", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analytics: c.analytics }),
    });
  } catch {
    // best-effort
  }
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsentState] = useState<CookieConsent>(DEFAULT_PENDING);
  const [hydrated, setHydrated] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Hydrate from storage on mount.
  useEffect(() => {
    setConsentState(readPersisted());
    setHydrated(true);
  }, []);

  const commit = useCallback((next: CookieConsent) => {
    setConsentState(next);
    persist(next);
    syncProfile(next);
  }, []);

  const acceptAll = useCallback(() => {
    commit(ALL_ACCEPTED);
    setPreferencesOpen(false);
  }, [commit]);

  const rejectAll = useCallback(() => {
    commit(ALL_REJECTED);
    setPreferencesOpen(false);
  }, [commit]);

  const setConsent = useCallback(
    (partial: Partial<CookieConsent>) => {
      const next: CookieConsent = {
        necessary: true,
        analytics: partial.analytics ?? consent.analytics,
        marketing: partial.marketing ?? consent.marketing,
        functional: partial.functional ?? consent.functional,
      };
      commit(next);
    },
    [consent, commit]
  );

  const needsDecision =
    hydrated &&
    (consent.analytics === null ||
      consent.marketing === null ||
      consent.functional === null);

  const value = useMemo<CookieConsentContextValue>(
    () => ({
      consent,
      needsDecision,
      acceptAll,
      rejectAll,
      setConsent,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
    }),
    [consent, needsDecision, acceptAll, rejectAll, setConsent, preferencesOpen]
  );

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error(
      "useCookieConsent must be used inside <CookieConsentProvider>"
    );
  }
  return ctx;
}

/**
 * Hook for analytics scripts / trackers that need to know whether they
 * can fire. Returns `false` until the user has decided. Once decided,
 * returns the actual category boolean.
 */
export function useAnalyticsAllowed(): boolean {
  const { consent } = useCookieConsent();
  return consent.analytics === true;
}

export function useMarketingAllowed(): boolean {
  const { consent } = useCookieConsent();
  return consent.marketing === true;
}
