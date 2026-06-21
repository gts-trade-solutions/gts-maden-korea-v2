// /lib/contexts/AuthContext.tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { supabase } from "@/lib/supabaseClient";
import { isSupportedLocale, type SupportedLocale } from "@/lib/locales";
import { COUNTRY_PROFILES, isSupportedCountry, type CountryCode } from "@/lib/countries";
import { isSupportedCurrency } from "@/lib/currency";

// Client-side auth-backend flag. Mirrors the server AUTH_BACKEND so the client
// flips at the same moment. Unset (default) = Supabase = current behavior; the
// NextAuth branches below only activate when this is "nextauth" (Step E).
const NEXTAUTH = process.env.NEXT_PUBLIC_AUTH_BACKEND === "nextauth";

type UserRole = "customer" | "admin" | "super_admin";

type SessionUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: UserRole;
  // `preferred_country` is read from public.profiles. When it's
  // null/missing for an authenticated user, the storefront's
  // <CountryGate> blocks the UI behind a country-picker modal so we
  // never have a logged-in user without a known country.
  preferred_country?: string | null;
};

type AuthContextType = {
  user: SessionUser | null;
  isAuthenticated: boolean;
  ready: boolean;
  isAdmin: boolean;
  hasRole: (role: UserRole) => boolean;
  // True when the user is authenticated AND their profile has no
  // preferred_country set. <CountryGate> reads this to decide whether
  // to render its blocking modal.
  needsCountrySelection: boolean;
  login: (c: { email: string; password: string }) => Promise<void>;
  register: (r: {
    full_name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as any);

// ──────────────────────────────────────────────────────────────
// Preference sync: cookies ↔ profile.preferred_locale/country.
//
// The cookies (`mik_locale`, `mik_country`, `mik_currency`) are the
// per-device source of truth. We mirror locale + country to the
// profile so a fresh browser sign-in can restore the same UI/region
// the user picked elsewhere. Currency follows from country, so it's
// derived (not stored).
// ──────────────────────────────────────────────────────────────
const COOKIE_MAX_AGE_DAYS = 365;
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}
function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * On sign-in: if the user's profile has preferred_locale /
 * preferred_country saved, write them through to the cookies so the
 * UI follows the user across devices. If the profile is empty (new
 * user or pre-feature account), seed it from the current cookies.
 *
 * Triggers a full reload when cookies change, because LocaleProvider
 * + CurrencyProvider snapshot the cookie at SSR time and won't pick
 * up a mid-session change otherwise.
 */
async function syncPreferencesOnLogin(userId: string) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_locale, preferred_country")
      .eq("id", userId)
      .maybeSingle();

    const cookieLocale = readCookie("mik_locale");
    const cookieCountry = readCookie("mik_country");
    const cookieCurrency = readCookie("mik_currency");

    const savedLocale = profile?.preferred_locale;
    const savedCountry = profile?.preferred_country;

    let cookieChanged = false;

    if (savedLocale && isSupportedLocale(savedLocale)) {
      if (cookieLocale !== savedLocale) {
        writeCookie("mik_locale", savedLocale);
        cookieChanged = true;
      }
    } else if (cookieLocale && isSupportedLocale(cookieLocale)) {
      // Profile empty → seed it from cookie (one-time backfill).
      await supabase
        .from("profiles")
        .update({ preferred_locale: cookieLocale })
        .eq("id", userId);
    }

    if (savedCountry && isSupportedCountry(savedCountry)) {
      if (cookieCountry !== savedCountry) {
        writeCookie("mik_country", savedCountry);
        // Cascade currency from country profile when restoring across
        // devices — otherwise a user signing in on a new device might
        // see Polish UI but INR prices.
        const newCurrency = COUNTRY_PROFILES[savedCountry as CountryCode].defaultCurrency;
        if (cookieCurrency !== newCurrency) {
          writeCookie("mik_currency", newCurrency);
        }
        cookieChanged = true;
      }
    }
    // The old "profile empty → backfill from cookie" branch for
    // preferred_country was removed when the CountryGate landed. Now
    // any user with a null preferred_country is intentionally being
    // asked to pick one explicitly via the modal — silently filling
    // in their (geo-detected, potentially wrong) cookie value behind
    // their back would defeat the gate's whole purpose. The signup
    // form and the gate are the only two places that write
    // preferred_country going forward.

    if (cookieChanged && typeof window !== "undefined") {
      // Full reload so SSR re-reads the cookies and providers pick up
      // the new values. Cheaper than threading a "rehydrate" path
      // through every provider.
      window.location.reload();
    }
  } catch {
    // Best-effort — never block sign-in on a preferences sync failure.
  }
}

/**
 * On signup: take whatever cookies the visitor's session has now and
 * write them to the new profile so subsequent sign-ins elsewhere
 * restore the same setup. Cookies are guaranteed present because
 * middleware seeds them on first visit.
 */
async function seedProfilePreferences(userId: string) {
  try {
    const cookieLocale = readCookie("mik_locale");
    const cookieCountry = readCookie("mik_country");
    const updates: Record<string, string> = {};
    if (cookieLocale && isSupportedLocale(cookieLocale)) {
      updates.preferred_locale = cookieLocale;
    }
    if (cookieCountry && isSupportedCountry(cookieCountry)) {
      updates.preferred_country = cookieCountry;
    }
    if (Object.keys(updates).length === 0) return;
    await supabase.from("profiles").update(updates).eq("id", userId);
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  // NextAuth session — only consumed when NEXTAUTH. Safe to call always; the
  // app is wrapped in NextAuthProvider's SessionProvider.
  const { data: naSession, status: naStatus } = useSession();

  // NextAuth hydration: id/email/role from the session (role is carried in the
  // JWT, Step B); name/avatar/preferred_country from /api/me/profile (MySQL).
  async function hydrateFromNextAuth(naUser: any) {
    if (!naUser) {
      setUser(null);
      return;
    }
    let p: any = null;
    try {
      const res = await fetch("/api/me/profile", { credentials: "include" });
      const j = await res.json().catch(() => ({}));
      p = j?.user ?? null;
    } catch {
      // best-effort — fall back to session-only fields
    }
    setUser({
      id: naUser.id,
      email: naUser.email ?? p?.email ?? null,
      full_name: p?.full_name ?? naUser.name ?? null,
      avatar_url: p?.avatar_url ?? naUser.image ?? null,
      role: ((naUser.role ?? p?.role) as UserRole) ?? "customer",
      preferred_country: p?.preferred_country ?? null,
    });
  }

  async function hydrateFromSession(authed: any) {
    if (!authed) {
      setUser(null);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, role, preferred_country")
      .eq("id", authed.id)
      .maybeSingle();

    setUser({
      id: authed.id,
      email: authed.email,
      full_name: profile?.full_name ?? authed.user_metadata?.full_name ?? null,
      avatar_url:
        profile?.avatar_url ?? authed.user_metadata?.avatar_url ?? null,
      role: (profile?.role as UserRole) ?? "customer",
      preferred_country: profile?.preferred_country ?? null,
    });
  }

  async function loadFromSession() {
    if (loadPromiseRef.current) return loadPromiseRef.current;

    loadPromiseRef.current = (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      await hydrateFromSession(session?.user ?? null);
    })().finally(() => {
      loadPromiseRef.current = null;
    });

    return loadPromiseRef.current;
  }

  // Supabase-mode identity (current). Skipped entirely under NextAuth.
  useEffect(() => {
    if (NEXTAUTH) return;
    let mounted = true;
    (async () => {
      await loadFromSession();
      if (mounted) setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const run = async () => {
        await hydrateFromSession(session?.user ?? null);
        setReady(true);
      };
      run();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // NextAuth-mode identity. Reacts to the NextAuth session resolving.
  useEffect(() => {
    if (!NEXTAUTH) return;
    if (naStatus === "loading") return;
    let mounted = true;
    (async () => {
      if (naSession?.user) {
        await hydrateFromNextAuth(naSession.user);
      } else {
        setUser(null);
      }
      if (mounted) setReady(true);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naStatus, (naSession?.user as any)?.id]);

  const login = async (c: { email: string; password: string }) => {
    if (NEXTAUTH) {
      const res = await signIn("credentials", {
        email: c.email,
        password: c.password,
        redirect: false,
      });
      if (res?.error) throw new Error("Invalid email or password");
      // useSession updates reactively; the NextAuth effect re-hydrates.
      setReady(true);
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword(c);
    if (error) throw error;
    await loadFromSession();
    setReady(true);
    // Mirror saved profile preferences into the cookies for this
    // browser. May trigger a reload if the saved values differ from
    // current cookies — that's intentional so SSR picks them up.
    if (data?.user?.id) {
      await syncPreferencesOnLogin(data.user.id);
    }
  };

  const register = async (r: {
    full_name: string;
    email: string;
    password: string;
  }) => {
    // Dual-write registration (transition period): the server route creates
    // the account in BOTH Supabase Auth (keeps the vendor app working) and
    // MySQL auth_users + profiles with the same id. We then sign in to
    // establish the Supabase session, exactly as signUp used to. This ensures
    // users registering now can log in via NextAuth after the auth flip.
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: r.email,
        password: r.password,
        full_name: r.full_name,
      }),
    });
    const j = await res.json().catch(() => ({} as any));
    if (!res.ok || !j?.ok) {
      const code = j?.error;
      throw new Error(
        code === "EMAIL_EXISTS"
          ? "An account with this email already exists."
          : code === "WEAK_PASSWORD"
            ? "Password must be at least 6 characters."
            : code || "Registration failed"
      );
    }

    if (NEXTAUTH) {
      const si = await signIn("credentials", {
        email: r.email,
        password: r.password,
        redirect: false,
      });
      if (si?.error) {
        throw new Error("Registered, but sign-in failed — please log in.");
      }
      setReady(true);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: r.email,
      password: r.password,
    });
    if (error) throw error;
    await loadFromSession();
    setReady(true);
    // Persist the visitor's already-chosen locale/country to the new
    // profile so future sign-ins on other devices restore the setup.
    if (j?.id) {
      await seedProfilePreferences(j.id);
    }
  };

  const logout = async () => {
    // Fire the analytics marker first; once we sign out the auth cookies
    // are gone and the track route would record this as anonymous.
    try {
      const { trackEvent } = await import("@/lib/analytics/track");
      trackEvent("logout", {}, { immediate: true });
    } catch {}
    if (NEXTAUTH) {
      await signOut({ redirect: false });
    } else {
      await supabase.auth.signOut();
    }
    setUser(null);
    setReady(true);
  };

  const refreshProfile = async () => {
    if (NEXTAUTH) {
      if (naSession?.user) await hydrateFromNextAuth(naSession.user);
      return;
    }
    await loadFromSession();
  };

  // Super admin is a strict superset of admin — every check gated on
  // `admin` should also pass for `super_admin` (otherwise the super
  // admin loses access to their own protection-from-demotion page).
  const hasRole = (role: UserRole) => {
    if (!user?.role) return false;
    if (role === "admin") {
      return user.role === "admin" || user.role === "super_admin";
    }
    return user.role === role;
  };
  const isAdmin = hasRole("admin");

  // Only flag the gate once auth has resolved AND we know the user has
  // no country. Without the `ready` guard, the modal would briefly
  // flash on every page during the auth-hydration window before
  // disappearing once the profile actually loads.
  const needsCountrySelection =
    ready && !!user && (user.preferred_country == null || user.preferred_country === "");

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      ready,
      isAdmin,
      hasRole,
      needsCountrySelection,
      login,
      register,
      logout,
      refreshProfile,
    }),
    [user, ready, needsCountrySelection]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
