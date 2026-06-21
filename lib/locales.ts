// Locale definitions for the multi-language storefront. The set is
// deliberately conservative for Phase 2 — Polish + Vietnamese are the
// growth-critical priorities, the European set covers the rest of
// where K-beauty translates well, and English variants cover everyone
// else as a fallback.
//
// Arabic / Swahili / Hausa are deliberately deferred (RTL complexity
// + low-resource language quality). They can be added later by
// extending SUPPORTED_LOCALES + LOCALE_INFO and re-running the
// translation pipeline.

export const SUPPORTED_LOCALES = [
  "en-IN", // India (default, no URL prefix)
  "en",    // generic English for non-Indian English markets
  "pl",    // Polish — priority 1
  "vi",    // Vietnamese — priority 2
  "th",    // Thai — added with Thailand market launch
  "fr",    // French
  "de",    // German
  "es",    // Spanish
  "it",    // Italian
  "pt",    // Portuguese
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// India is the source of truth for content; everything else translates
// from it. Visiting the bare URL `/products/foo` resolves to this
// locale (no prefix) via next-intl's `localePrefix: "as-needed"`.
export const DEFAULT_LOCALE: SupportedLocale = "en-IN";

export type LocaleInfo = {
  /** ISO code we use as the URL prefix and message-file name. */
  code: SupportedLocale;
  /** English display name (for the admin / debug surfaces). */
  name: string;
  /** Self-name shown to the customer in their language. */
  nativeName: string;
  /** Locale tag we feed Intl.NumberFormat / Intl.DateTimeFormat. */
  intlTag: string;
  /** Whether the script flows right-to-left. None of our Phase-2
      locales are RTL; the flag is here so Arabic etc. plug in cleanly
      when added later. */
  rtl?: boolean;
};

export const LOCALE_INFO: Record<SupportedLocale, LocaleInfo> = {
  "en-IN": { code: "en-IN", name: "English (India)", nativeName: "English (India)", intlTag: "en-IN" },
  "en":    { code: "en",    name: "English",         nativeName: "English",         intlTag: "en" },
  "pl":    { code: "pl",    name: "Polish",          nativeName: "Polski",          intlTag: "pl-PL" },
  "vi":    { code: "vi",    name: "Vietnamese",      nativeName: "Tiếng Việt",      intlTag: "vi-VN" },
  "th":    { code: "th",    name: "Thai",            nativeName: "ไทย",             intlTag: "th-TH" },
  "fr":    { code: "fr",    name: "French",          nativeName: "Français",        intlTag: "fr-FR" },
  "de":    { code: "de",    name: "German",          nativeName: "Deutsch",         intlTag: "de-DE" },
  "es":    { code: "es",    name: "Spanish",         nativeName: "Español",         intlTag: "es-ES" },
  "it":    { code: "it",    name: "Italian",         nativeName: "Italiano",        intlTag: "it-IT" },
  "pt":    { code: "pt",    name: "Portuguese",      nativeName: "Português",       intlTag: "pt-PT" },
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
