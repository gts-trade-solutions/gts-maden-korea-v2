// next-intl routing config.
//
// Phase 2.1 (Foundation) decision:
//   `localePrefix: "never"` — locale is resolved from the `mik_locale`
//   cookie (seeded in middleware, written by CountrySwitcher). URLs
//   stay flat (`/products/foo`) regardless of language. This avoids a
//   one-shot move of every customer route under `app/[locale]/` while
//   we don't yet have translation content to justify it.
//
//   When translations land (Phase 2.4+) we'll flip this to
//   `"as-needed"` and migrate routes into a `[locale]` segment in a
//   focused session. The cookie + provider plumbing built here works
//   under either strategy.
//
//   `localeDetection: false` because our middleware seeds the cookie
//   from geo + country profile; letting next-intl guess from
//   Accept-Language would race with that.

import { defineRouting } from "next-intl/routing";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/lib/locales";

export const routing = defineRouting({
  locales: [...SUPPORTED_LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "never",
  localeDetection: false,
});
