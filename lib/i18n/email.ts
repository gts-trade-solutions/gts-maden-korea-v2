// Email translator helper.
//
// Resolves a recipient's locale (from one of: order.recipient_locale,
// profiles.preferred_locale, request cookie, default) and returns a
// next-intl translator scoped to the `emails` namespace. Each email-
// sending route uses this to render subjects + body strings in the
// right language; the HTML structure stays in TypeScript.
//
// Why server-side `createTranslator` instead of `getTranslations`:
// the latter relies on AsyncLocalStorage middleware that's wired for
// page requests; SES sends happen in arbitrary route handlers and
// scheduled functions where that context isn't reliable. `createTranslator`
// is the explicit, dependency-injected form.

import { createTranslator } from "next-intl";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  type SupportedLocale,
} from "@/lib/locales";

// Lazy-imported per locale so a 9-locale set doesn't bloat every
// route handler's cold-start bundle.
async function loadMessages(locale: SupportedLocale) {
  switch (locale) {
    case "en-IN":
      return (await import("@/messages/en-IN.json")).default;
    case "en":
      return (await import("@/messages/en.json")).default;
    case "pl":
      return (await import("@/messages/pl.json")).default;
    case "vi":
      return (await import("@/messages/vi.json")).default;
    case "th":
      return (await import("@/messages/th.json")).default;
    case "fr":
      return (await import("@/messages/fr.json")).default;
    case "de":
      return (await import("@/messages/de.json")).default;
    case "es":
      return (await import("@/messages/es.json")).default;
    case "it":
      return (await import("@/messages/it.json")).default;
    case "pt":
      return (await import("@/messages/pt.json")).default;
  }
}

export function resolveLocale(candidate: unknown): SupportedLocale {
  if (typeof candidate === "string") {
    const lower = candidate.toLowerCase();
    const match = SUPPORTED_LOCALES.find(
      (l) => l.toLowerCase() === lower
    );
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/**
 * Returns a next-intl `t(...)` function scoped to the `emails`
 * namespace for the given locale. Falls back to the default locale
 * silently if the bundle for `locale` can't be loaded — emails must
 * never fail to send because of a missing translation.
 */
export async function getEmailTranslator(rawLocale: string | null | undefined) {
  const locale = resolveLocale(rawLocale);

  let messages: any;
  try {
    messages = await loadMessages(locale);
  } catch {
    messages = await loadMessages(DEFAULT_LOCALE);
  }

  const t = createTranslator({
    locale,
    messages,
    namespace: "emails",
  });

  return { t, locale };
}

/**
 * Format an ISO date in the recipient's locale.
 *
 * Uses `Intl.DateTimeFormat` with the locale's BCP-47 tag (en-IN, fr,
 * de, ...). Falls back to the raw ISO string if locale is somehow
 * rejected. Email senders should pass `locale` from `getEmailTranslator`.
 */
export function formatDateForLocale(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
