"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CurrencyCode,
  CurrencyRate,
  FALLBACK_RATES,
  formatPrice as formatPriceUtil,
  isSupportedCurrency,
} from "@/lib/currency";

// Sitewide currency state. Loaded once from `/api/currency/rates` on
// first mount; user's selected currency is persisted to a cookie
// (`mik_currency`) AND localStorage so SSR can render the right
// currency on first paint after a refresh.
//
// Indian visitors stay on INR by default and never interact with the
// switcher. International visitors see their preferred currency based
// on geo detection (middleware sets the cookie on first visit), and
// can override via the header switcher.

const COOKIE_NAME = "mik_currency";
const COOKIE_MAX_AGE_DAYS = 365;
const STORAGE_KEY = "mik_currency_v1";

type CurrencyContextValue = {
  currency: CurrencyCode;
  rate: CurrencyRate;
  rates: Record<CurrencyCode, CurrencyRate>;
  setCurrency: (code: CurrencyCode) => void;
  formatPrice: (amountInr: number) => string;
  /** True when INR is selected — used to gate India-only UI. */
  isINR: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

// Read the SSR-set cookie on first render so we don't flash the wrong
// currency. Cookie is the source of truth; localStorage just makes
// subsequent client-side reads instant.
function readInitialCurrency(): CurrencyCode {
  if (typeof document === "undefined") return "INR";

  // Cookie first.
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`)
  );
  const cookieValue = match?.[1] ? decodeURIComponent(match[1]) : null;
  if (isSupportedCurrency(cookieValue)) return cookieValue;

  // Fallback: localStorage (older visit, cookie cleared).
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSupportedCurrency(stored)) return stored;
  } catch {}

  return "INR";
}

function persistCurrency(code: CurrencyCode) {
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

export function CurrencyProvider({
  children,
  initialCurrency,
}: {
  children: React.ReactNode;
  /**
   * Currency to render with on the very first paint. The root layout
   * (server component) reads the `mik_currency` cookie via
   * `next/headers` and passes it here so SSR and the client's first
   * render agree. Without this, the server renders INR (default) and
   * the client immediately switches to the cookie value, triggering
   * a React hydration warning.
   */
  initialCurrency?: CurrencyCode;
}) {
  // Prefer the server-provided value (SSR + first client render
  // match). Fall back to cookie/localStorage read for legacy callers
  // that don't pass the prop yet.
  const [currency, setCurrencyState] = useState<CurrencyCode>(
    () => initialCurrency ?? readInitialCurrency()
  );
  const [rates, setRates] = useState<Record<CurrencyCode, CurrencyRate>>(
    FALLBACK_RATES
  );

  // Fetch live rates from the API once on mount. Falls back to
  // compiled-in values if the fetch fails so pricing always renders.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/currency/rates", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { rates?: CurrencyRate[] };
        if (cancelled || !data?.rates?.length) return;
        const map: Partial<Record<CurrencyCode, CurrencyRate>> = {};
        for (const r of data.rates) {
          if (isSupportedCurrency(r.code)) map[r.code] = r;
        }
        setRates({ ...FALLBACK_RATES, ...map });
      } catch {
        // ignore — fallback already in place
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrency = useCallback((code: CurrencyCode) => {
    persistCurrency(code);
    setCurrencyState(code);
  }, []);

  // Resolve the active rate row. Always defined because FALLBACK_RATES
  // covers every supported code.
  const rate = rates[currency] ?? FALLBACK_RATES[currency];

  const formatPrice = useCallback(
    (amountInr: number) => formatPriceUtil(amountInr, rate),
    [rate]
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      rate,
      rates,
      setCurrency,
      formatPrice,
      isINR: currency === "INR",
    }),
    [currency, rate, rates, setCurrency, formatPrice]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

/** Read the active currency, rate, and formatter. */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Defensive fallback so a missing provider doesn't crash the page.
    // In dev this should never happen; in prod it provides INR.
    const rate = FALLBACK_RATES.INR;
    return {
      currency: "INR",
      rate,
      rates: FALLBACK_RATES,
      setCurrency: () => {},
      formatPrice: (n: number) => formatPriceUtil(n, rate),
      isINR: true,
    };
  }
  return ctx;
}
