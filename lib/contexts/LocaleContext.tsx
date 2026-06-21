"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_INFO,
  type LocaleInfo,
  type SupportedLocale,
} from "@/lib/locales";

// Mirrors CurrencyContext: the active locale is server-rendered (root
// layout reads the `mik_locale` cookie) and passed in as `initialLocale`
// so SSR + first client paint agree. After mount the user can change
// it via CountrySwitcher; we update state, persist to cookie +
// localStorage, and trigger a navigation (URL prefix changes for
// non-default locales).
//
// Actual navigation happens in the CountrySwitcher — this context
// only carries the chosen locale + setter. Pages read the locale via
// next-intl's useLocale() / useTranslations() hooks, not this
// context. We expose useLocale() here for non-translation surfaces
// (e.g., the switcher itself).

const COOKIE_NAME = "mik_locale";
const COOKIE_MAX_AGE_DAYS = 365;
const STORAGE_KEY = "mik_locale_v1";

type LocaleContextValue = {
  locale: SupportedLocale;
  info: LocaleInfo;
  setLocale: (next: SupportedLocale) => void;
  /** True when the active locale is en-IN (no URL prefix). */
  isDefault: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function persistLocale(code: SupportedLocale) {
  if (typeof document !== "undefined") {
    const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(code)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, code);
    }
  } catch {}
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  /** Server-supplied locale read from the `mik_locale` cookie in the
      root layout. Required for SSR/CSR agreement. */
  initialLocale?: SupportedLocale;
}) {
  const [locale, setLocaleState] = useState<SupportedLocale>(
    initialLocale ?? DEFAULT_LOCALE
  );

  const setLocale = useCallback((next: SupportedLocale) => {
    if (!isSupportedLocale(next)) return;
    persistLocale(next);
    setLocaleState(next);
  }, []);

  const info = LOCALE_INFO[locale];

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      info,
      setLocale,
      isDefault: locale === DEFAULT_LOCALE,
    }),
    [locale, info, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/**
 * App-level locale hook. Use this only on surfaces that need to
 * mutate the locale (the switcher, the signup hook). For *reading*
 * translated text or formatting per-locale numbers/dates, use
 * next-intl's useLocale() and useTranslations() from "next-intl"
 * instead — those are aware of the routing context.
 */
export function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    const info = LOCALE_INFO[DEFAULT_LOCALE];
    return {
      locale: DEFAULT_LOCALE,
      info,
      setLocale: () => {},
      isDefault: true,
    };
  }
  return ctx;
}
