"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  COUNTRY_PROFILES,
  DEFAULT_COUNTRY,
  isSupportedCountry,
  type CountryCode,
  type CountryProfile,
} from "@/lib/countries";

// Mirrors CurrencyContext + LocaleContext: the active country is
// server-rendered (root layout reads the `mik_country` cookie) and
// passed in as `initialCountry` so SSR and the first client paint
// agree. The CountrySwitcher reads + writes this context, and on
// change cascades to LocaleContext + CurrencyContext via the
// switcher itself (not this provider).
//
// Why a context for a single value? Two reasons:
//   1. The switcher needs to render the current flag/code in its
//      trigger.
//   2. Future surfaces (e.g., personalized PDP copy, shipping
//      estimator, KYC prompts) need a single source of truth.

const COOKIE_NAME = "mik_country";
const COOKIE_MAX_AGE_DAYS = 365;
const STORAGE_KEY = "mik_country_v1";

type CountryContextValue = {
  country: CountryCode;
  profile: CountryProfile;
  setCountry: (next: CountryCode) => void;
};

const CountryContext = createContext<CountryContextValue | null>(null);

function persistCountry(code: CountryCode) {
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

export function CountryProvider({
  children,
  initialCountry,
}: {
  children: React.ReactNode;
  /** Server-supplied country read from the `mik_country` cookie in the
      root layout. Required for SSR/CSR agreement. */
  initialCountry?: CountryCode;
}) {
  const [country, setCountryState] = useState<CountryCode>(
    initialCountry ?? DEFAULT_COUNTRY
  );

  const setCountry = useCallback((next: CountryCode) => {
    if (!isSupportedCountry(next)) return;
    persistCountry(next);
    setCountryState(next);
  }, []);

  const profile = COUNTRY_PROFILES[country];

  const value = useMemo<CountryContextValue>(
    () => ({ country, profile, setCountry }),
    [country, profile, setCountry]
  );

  return (
    <CountryContext.Provider value={value}>{children}</CountryContext.Provider>
  );
}

export function useCountry(): CountryContextValue {
  const ctx = useContext(CountryContext);
  if (!ctx) {
    return {
      country: DEFAULT_COUNTRY,
      profile: COUNTRY_PROFILES[DEFAULT_COUNTRY],
      setCountry: () => {},
    };
  }
  return ctx;
}
