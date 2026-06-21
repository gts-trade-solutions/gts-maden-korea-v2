"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  SUPPORTED_COUNTRIES,
  COUNTRY_PROFILES,
  isSupportedCountry,
  DEFAULT_COUNTRY,
  type CountryCode,
} from "@/lib/countries";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Forces every signed-in user without a `preferred_country` on their
// profile to pick one before they can interact with the app. Mounted
// in the root layout. Skips itself on auth pages so logout / re-login
// flows aren't blocked.
//
// Edge cases handled:
//   • Anonymous users — gate never renders (no profile to satisfy).
//   • Auth still hydrating — gate stays hidden (we'd otherwise flash
//     the modal for a frame on every page during the auth-loading
//     window). The needsCountrySelection flag in AuthContext gates on
//     `ready` too as a belt-and-suspenders.
//   • User on /auth/login or /auth/register — gate hidden so the user
//     can complete those flows. They'll be gated on the next route
//     change after login if their profile lacks a country.
//   • User on /auth/callback (OAuth landing) — also hidden, so the
//     OAuth handler can finish redirecting before the modal kicks in.
//   • User cancels mid-save (network error) — modal stays open,
//     toast/error inline, user can retry.
//   • Profile already had a country but cookie was wiped — the gate
//     stays hidden (we trust the profile), and AuthContext separately
//     re-syncs the cookie on next sign-in.
//   • User picks a country, then opens a new tab — that tab still
//     shows the gate until next mount (acceptable; this is a one-time
//     event per user).

const SKIP_PATH_PREFIXES = ["/auth/", "/api/"];

export function CountryGate() {
  const { user, needsCountrySelection, refreshProfile } = useAuth();
  const pathname = usePathname();
  const [country, setCountry] = useState<CountryCode>(() =>
    readCountryFromCookie()
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync the dropdown when the user's cookie value changes between
  // mounts (e.g. middleware updated it from geo on first visit). The
  // user can still pick anything; this just primes the default to the
  // most-plausible value.
  useEffect(() => {
    setCountry(readCountryFromCookie());
  }, [user?.id]);

  const isOnSkipPath = useMemo(
    () =>
      !!pathname &&
      SKIP_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)),
    [pathname]
  );

  if (!needsCountrySelection || isOnSkipPath) return null;

  const submit = async () => {
    if (!isSupportedCountry(country)) {
      setError("Please pick a country before continuing.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/me/country", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ country }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body?.error || "Couldn't save your country. Try again.");
        return;
      }

      // Pull the freshly-saved preferred_country back into AuthContext
      // so `needsCountrySelection` flips to false and the gate
      // unmounts. The cookie is set by the API server-side; next page
      // load will see the new value.
      await refreshProfile();

      // The server set mik_country / mik_currency / mik_locale cookies
      // in the response, but those don't reach SSR-rendered HTML until
      // the next navigation. A full reload picks them up immediately so
      // banners, prices, K-Partnership offers, etc. all reflect the
      // chosen country without the user having to navigate around.
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (e: any) {
      setError(e?.message || "Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="country-gate-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-background shadow-2xl">
        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 id="country-gate-title" className="text-lg sm:text-xl font-semibold">
              Welcome — where are you shopping from?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick your country so we can show you prices, shipping
              estimates, and offers that apply to where you are.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="country-gate-select" className="text-sm font-medium">
              Country
            </label>
            <select
              id="country-gate-select"
              value={country}
              onChange={(e) => setCountry(e.target.value as CountryCode)}
              disabled={submitting}
              className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
            >
              {SUPPORTED_COUNTRIES.map((code) => {
                const profile = COUNTRY_PROFILES[code];
                // `<option>` content is plain text only — SVGs can't
                // render inside, so we just show the country name.
                return (
                  <option key={code} value={code}>
                    {profile?.name ?? code}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-muted-foreground">
              You can change this later from the country selector in the
              header.
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving…
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function readCountryFromCookie(): CountryCode {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

export default CountryGate;
