// Server-side message loader for next-intl.
//
// Phase 2.1: routing uses `localePrefix: "never"` (cookie-based), so
// `requestLocale` is always empty here. We read the active locale
// directly from the `mik_locale` cookie (seeded in middleware,
// rewritten by the CountrySwitcher), validate it, and dynamic-import
// the matching `messages/*.json`.
//
// Phase 2.2 will populate those JSON files via the Anthropic
// translation pipeline. Until then every component renders the
// English fallback returned by `t()` / `useTranslations()`, which is
// the expected Phase 2.1 outcome.

import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { routing } from "@/i18n/routing";
import { isSupportedLocale } from "@/lib/locales";

const LOCALE_COOKIE = "mik_locale";

export default getRequestConfig(async () => {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
