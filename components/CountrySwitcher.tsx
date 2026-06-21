"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { useLocaleContext } from "@/lib/contexts/LocaleContext";
import { useCountry } from "@/lib/contexts/CountryContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  COUNTRY_PROFILES,
  SUPPORTED_COUNTRIES,
  type CountryCode,
} from "@/lib/countries";
import { LOCALE_INFO, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/lib/currency";
import { Flag } from "@/components/Flag";

// Single header control that lets the visitor change country,
// language, and currency from one popover. Picking a country
// *cascades* — it updates the locale and currency to the country
// profile's defaults. Language and currency can still be overridden
// independently after — useful for, e.g., a Polish-speaking visitor
// in Germany who wants EUR pricing but Polish UI.
//
// When the user is signed in we also POST the new (locale, country)
// pair to /api/user/preferences so the next session restores it.
// Anonymous visitors rely on the cookies alone.

type Section = "country" | "language" | "currency";

export function CountrySwitcher() {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("country");

  const { country, profile, setCountry } = useCountry();
  const { locale, setLocale } = useLocaleContext();
  const { currency, rates, setCurrency } = useCurrency();
  const { isAuthenticated } = useAuth();

  // Best-effort persistence to profile. Fire-and-forget — the cookies
  // are the source of truth; the profile is just a "remember me on
  // next device" convenience. Failure here must never block the UI.
  const syncToProfile = async (nextLocale: SupportedLocale, nextCountry: CountryCode) => {
    if (!isAuthenticated) return;
    try {
      await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_locale: nextLocale,
          preferred_country: nextCountry,
        }),
      });
    } catch {}
  };

  // A full page reload is needed any time the server-rendered output
  // depends on a cookie we just changed:
  //  • locale → next-intl message bundles are snapshotted at SSR, so
  //    a client-only change leaves rendered strings stale.
  //  • country → home banners are fetched per country in the RSC
  //    (getBanners reads `mik_country`), so without a reload the new
  //    country's banner set never gets queried.
  // Currency is client-side only (formatPrice re-renders) and does
  // not require a reload.
  const reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  const handleCountry = (next: CountryCode) => {
    const p = COUNTRY_PROFILES[next];
    setCountry(next);
    setLocale(p.defaultLocale);
    setCurrency(p.defaultCurrency);
    syncToProfile(p.defaultLocale, next);
    setOpen(false);
    // Always reload — even when locale didn't change, the country
    // change must propagate to server-rendered country-scoped data
    // (banners today; pricing/shipping rules in future phases).
    reload();
  };

  const handleLanguage = (next: SupportedLocale) => {
    const localeChanged = next !== locale;
    setLocale(next);
    syncToProfile(next, country);
    setOpen(false);
    if (localeChanged) reload();
  };

  const handleCurrency = (next: CurrencyCode) => {
    setCurrency(next);
    setOpen(false);
    // Currency override doesn't change profile preferences and
    // doesn't need a reload — CurrencyContext re-renders prices
    // client-side fine.
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="
          inline-flex items-center gap-1.5 rounded-md px-2 py-1.5
          text-sm font-medium text-foreground hover:bg-accent
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        "
        aria-label={`Country: ${profile.name}. Change country, language, or currency`}
      >
        <Flag code={profile.code} width={20} className="rounded-[2px] shrink-0" alt="" />
        <span className="hidden sm:inline">{profile.code}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
        <div className="flex border-b text-xs">
          {(["country", "language", "currency"] as Section[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSection(s)}
              className={`
                flex-1 px-3 py-2 capitalize transition-colors
                ${activeSection === s
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent/50"}
              `}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {activeSection === "country" && (
            <ul role="listbox">
              {SUPPORTED_COUNTRIES.map((code) => {
                const p = COUNTRY_PROFILES[code];
                const isActive = country === code;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleCountry(code)}
                      className="
                        flex w-full items-center justify-between gap-3 px-3 py-2
                        text-sm hover:bg-accent cursor-pointer
                      "
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Flag code={p.code} width={20} className="rounded-[2px] shrink-0" alt="" />
                        <span className="font-medium truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.defaultLocale} · {p.defaultCurrency}
                        </span>
                      </span>
                      {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {activeSection === "language" && (
            <ul role="listbox">
              {SUPPORTED_LOCALES.map((code) => {
                const info = LOCALE_INFO[code];
                const isActive = locale === code;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleLanguage(code)}
                      className="
                        flex w-full items-center justify-between gap-3 px-3 py-2
                        text-sm hover:bg-accent cursor-pointer
                      "
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-medium">{info.nativeName}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {info.name}
                        </span>
                      </span>
                      {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {activeSection === "currency" && (
            <ul role="listbox">
              {SUPPORTED_CURRENCIES.map((code) => {
                const r = rates[code];
                if (!r) return null;
                const isActive = currency === code;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleCurrency(code)}
                      className="
                        flex w-full items-center justify-between gap-3 px-3 py-2
                        text-sm hover:bg-accent cursor-pointer
                      "
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex w-6 justify-center font-semibold text-muted-foreground">
                          {r.symbol}
                        </span>
                        <span className="font-medium">{r.code}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {r.name}
                        </span>
                      </span>
                      {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
