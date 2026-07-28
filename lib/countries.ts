// Country profiles for the CountrySwitcher. Picking a country in the
// header cascades to (locale, currency); users can independently
// override each axis after.
//
// Country list deliberately covers only the markets we actively serve
// or plan to serve. Other countries (anywhere not in this map) fall
// back to "en" locale and INR currency — the visitor can still pick
// any combination manually.

import type { CurrencyCode } from "@/lib/currency";
import type { SupportedLocale } from "@/lib/locales";

export type CountryCode =
  | "IN" | "US" | "GB"
  | "PL" | "VN" | "TH" | "KR"
  | "FR" | "DE" | "ES" | "IT" | "PT"
  | "ZA" | "TZ" | "NG" | "QA" | "AE";

export type CountryProfile = {
  code: CountryCode;
  name: string;
  /** Flag emoji shown in the switcher dropdown. */
  flag: string;
  /** Auto-applied locale when the country is selected. */
  defaultLocale: SupportedLocale;
  /** Auto-applied currency when the country is selected. */
  defaultCurrency: CurrencyCode;
};

// NOTE: The key order below IS the display order in the CountrySwitcher
// (it maps SUPPORTED_COUNTRIES, which is Object.keys(COUNTRY_PROFILES), with
// no sort). US and South Korea are featured first; India is intentionally
// placed 10th. This ordering is purely cosmetic — DEFAULT_COUNTRY (below)
// stays "IN" and remains the geo/currency fallback regardless of position.
export const COUNTRY_PROFILES: Record<CountryCode, CountryProfile> = {
  // Featured markets — shown first in the switcher.
  US: { code: "US", name: "United States", flag: "🇺🇸", defaultLocale: "en",    defaultCurrency: "USD" },
  // South Korea — Korean UI bundle (messages/ko.json). KRW is zero-decimal;
  // formatting handled natively by Intl with ko-KR locale.
  KR: { code: "KR", name: "South Korea",   flag: "🇰🇷", defaultLocale: "ko",    defaultCurrency: "KRW" },

  // UK + Eurozone
  GB: { code: "GB", name: "United Kingdom",flag: "🇬🇧", defaultLocale: "en",    defaultCurrency: "GBP" },
  FR: { code: "FR", name: "France",        flag: "🇫🇷", defaultLocale: "fr",    defaultCurrency: "EUR" },
  DE: { code: "DE", name: "Germany",       flag: "🇩🇪", defaultLocale: "de",    defaultCurrency: "EUR" },
  ES: { code: "ES", name: "Spain",         flag: "🇪🇸", defaultLocale: "es",    defaultCurrency: "EUR" },
  IT: { code: "IT", name: "Italy",         flag: "🇮🇹", defaultLocale: "it",    defaultCurrency: "EUR" },
  PT: { code: "PT", name: "Portugal",      flag: "🇵🇹", defaultLocale: "pt",    defaultCurrency: "EUR" },
  // Poland — EU member but keeps the zloty.
  PL: { code: "PL", name: "Poland",        flag: "🇵🇱", defaultLocale: "pl",    defaultCurrency: "PLN" },

  // India — home market (10th in the list, but still DEFAULT_COUNTRY).
  IN: { code: "IN", name: "India",         flag: "🇮🇳", defaultLocale: "en-IN", defaultCurrency: "INR" },

  // Other Asia
  VN: { code: "VN", name: "Vietnam",       flag: "🇻🇳", defaultLocale: "vi",    defaultCurrency: "VND" },
  // Thailand — Thai UI bundle landed (messages/th.json). Currency
  // formatting in THB handled natively by Intl with th-TH locale.
  TH: { code: "TH", name: "Thailand",      flag: "🇹🇭", defaultLocale: "th",    defaultCurrency: "THB" },

  // Africa + Middle East currently served as English/local-currency
  // until we add Arabic/Swahili/Hausa coverage in a future phase.
  ZA: { code: "ZA", name: "South Africa",  flag: "🇿🇦", defaultLocale: "en",    defaultCurrency: "ZAR" },
  TZ: { code: "TZ", name: "Tanzania",      flag: "🇹🇿", defaultLocale: "en",    defaultCurrency: "TZS" },
  NG: { code: "NG", name: "Nigeria",       flag: "🇳🇬", defaultLocale: "en",    defaultCurrency: "NGN" },
  QA: { code: "QA", name: "Qatar",         flag: "🇶🇦", defaultLocale: "en",    defaultCurrency: "QAR" },
  AE: { code: "AE", name: "UAE",           flag: "🇦🇪", defaultLocale: "en",    defaultCurrency: "AED" },
};

export const SUPPORTED_COUNTRIES = Object.keys(COUNTRY_PROFILES) as CountryCode[];

export const DEFAULT_COUNTRY: CountryCode = "IN";

export function isSupportedCountry(value: unknown): value is CountryCode {
  return typeof value === "string" && (SUPPORTED_COUNTRIES as string[]).includes(value);
}

export function getCountryProfile(code: string | null | undefined): CountryProfile | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return isSupportedCountry(upper) ? COUNTRY_PROFILES[upper] : null;
}
