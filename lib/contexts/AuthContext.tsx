// /lib/contexts/AuthContext.tsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

type UserRole = "customer" | "admin" | "super_admin";

type SessionUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: UserRole;
  // `preferred_country` is read from the profile. When it's null/missing for an
  // authenticated user, the storefront's <CountryGate> blocks the UI behind a
  // country-picker modal so we never have a logged-in user without a country.
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  // The app is wrapped in NextAuthProvider's SessionProvider.
  const { data: naSession, status: naStatus } = useSession();

  // Identity hydration: id/email/role come from the NextAuth session (role is
  // carried in the JWT, set at sign-in); name/avatar/preferred_country come
  // from /api/me/profile (MySQL).
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

  // Reacts to the NextAuth session resolving.
  useEffect(() => {
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
    const res = await signIn("credentials", {
      email: c.email,
      password: c.password,
      redirect: false,
    });
    if (res?.error) throw new Error("Invalid email or password");
    // useSession updates reactively; the effect above re-hydrates.
    setReady(true);
  };

  const register = async (r: {
    full_name: string;
    email: string;
    password: string;
  }) => {
    // The server route creates the account in MySQL (auth_users + profiles)
    // and stamps the email-verification grace clock; we then sign in to
    // establish the NextAuth session.
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

    const si = await signIn("credentials", {
      email: r.email,
      password: r.password,
      redirect: false,
    });
    if (si?.error) {
      throw new Error("Registered, but sign-in failed — please log in.");
    }
    setReady(true);
  };

  const logout = async () => {
    // Fire the analytics marker first; once we sign out the auth cookies
    // are gone and the track route would record this as anonymous.
    try {
      const { trackEvent } = await import("@/lib/analytics/track");
      trackEvent("logout", {}, { immediate: true });
    } catch {}
    await signOut({ redirect: false });
    setUser(null);
    setReady(true);
  };

  const refreshProfile = async () => {
    if (naSession?.user) await hydrateFromNextAuth(naSession.user);
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
