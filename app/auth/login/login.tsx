"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signIn, useSession } from "next-auth/react";
import { supabase } from "@/lib/supabaseClient";
import { CustomerLayout } from "@/components/CustomerLayout";

// Client auth-backend flag (mirrors server AUTH_BACKEND). Unset = Supabase.
const NEXTAUTH = process.env.NEXT_PUBLIC_AUTH_BACKEND === "nextauth";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

function GoogleLogo() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function FacebookLogo() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

// Single browser client (persists session in localStorage)
export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/account";
  const t = useTranslations("auth.signIn");
  const tc = useTranslations("common");
const [oauthLoading, setOauthLoading] = useState<"google" | "facebook" | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  // NextAuth session — used for the already-logged-in redirect under nextauth.
  const { data: naSession, status: naStatus } = useSession();

  // If already logged in, go where they intended.
  useEffect(() => {
    if (NEXTAUTH) {
      if (naStatus === "loading") return;
      if (naSession?.user) router.replace(redirect);
      setLoading(false);
      return;
    }
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) router.replace(redirect);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, redirect, naStatus, (naSession?.user as any)?.id]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const mapAuthError = (message?: string) => {
    const m = (message || "").toLowerCase();
    if (m.includes("invalid login credentials")) return t("errInvalidCredentials");
    if (m.includes("email not confirmed")) return t("errEmailNotConfirmed");
    if (m.includes("too many requests")) return t("errTooManyRequests");
    return t("errGeneric");
  };

  // Attach browser session to server cookies so /api routes & RSC see auth
  const attachAfterAuth = async () => {
    const { data: s } = await supabase.auth.getSession();
    const at = s?.session?.access_token;
    const rt = s?.session?.refresh_token;
    if (!at || !rt) return;
    // sets sb-* cookies on the response
    await fetch("/api/auth/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ access_token: at, refresh_token: rt }),
    }).catch(() => {});
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = form.email.trim();
    const password = form.password;

    if (!email || !password) {
      toast.error(t("missingFields"));
      return;
    }

    setSubmitting(true);

    if (NEXTAUTH) {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        setSubmitting(false);
        toast.error(t("errInvalidCredentials"));
        return;
      }
      void fetch("/api/events/identify", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "login" }),
      }).catch(() => {});
      setSubmitting(false);
      toast.success(t("signedIn"));
      router.replace(redirect);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSubmitting(false);
      toast.error(mapAuthError(error.message));
      return;
    }

    // If a session was returned, set SSR cookies so server can see auth immediately
    if (data.session) {
      await attachAfterAuth();
    }

    // Fire-and-forget: stitch pre-login anonymous activity onto the new
    // user_id and emit a `login` event for funnel attribution.
    void fetch("/api/events/identify", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "login" }),
    }).catch(() => {});

    setSubmitting(false);
    toast.success(t("signedIn"));
    router.replace(redirect);
  };

const loginWithProvider = async (provider: "google" | "facebook") => {
  try {
    setOauthLoading(provider);

    const redirectParam = redirect || "/account";

    if (NEXTAUTH) {
      // NextAuth drives the OAuth redirect + its own /api/auth/callback.
      await signIn(provider, { callbackUrl: redirectParam });
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // This must match what you added in Supabase URL config:
        // e.g. http://localhost:3000/auth/callback
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
          redirectParam,
        )}`,
      },
    });

    if (error) {
      toast.error(error.message || `Could not start ${provider} sign in`);
      setOauthLoading(null);
    }
    // On success, browser will be redirected away, so code after this usually
    // won't run. We don't call attachAfterAuth here – that's done in /auth/callback.
  } catch (err: any) {
    console.error(err);
    toast.error("Something went wrong, please try again.");
    setOauthLoading(null);
  }
};

const handleGoogleLogin = () => loginWithProvider("google");
const handleFacebookLogin = () => loginWithProvider("facebook");


  if (loading) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader><CardTitle>{t("title")}</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">{tc("loading")}</p></CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              {/* OAuth at the top — fastest path. Email form sits
                  below the divider as a secondary option. */}
              <div className="space-y-2">
                <Button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={oauthLoading !== null}
                  className="w-full bg-white text-black border border-gray-300 hover:bg-gray-50 justify-center gap-2"
                >
                  <GoogleLogo />
                  {oauthLoading === "google" ? t("redirectingToGoogle") : t("continueWithGoogle")}
                </Button>
                <Button
                  type="button"
                  onClick={handleFacebookLogin}
                  disabled={oauthLoading !== null}
                  className="w-full bg-[#1877F2] text-white hover:bg-[#166FE5] justify-center gap-2"
                >
                  <FacebookLogo />
                  {oauthLoading === "facebook" ? t("redirectingToFacebook") : t("continueWithFacebook")}
                </Button>
              </div>

              <div className="relative flex items-center py-1">
                <div className="flex-1 border-t" />
                <span className="px-2 text-xs text-muted-foreground">
                  {t("orWithEmail")}
                </span>
                <div className="flex-1 border-t" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={onChange}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={form.password}
                    onChange={onChange}
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                    title={showPassword ? t("hidePassword") : t("showPassword")}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="text-right">
                  <Link href="/auth/forgot" className="text-sm text-primary hover:underline">
                    {t("forgotPassword")}
                  </Link>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("submitting") : t("submit")}
              </Button>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
             

              <p className="text-sm text-center text-muted-foreground">
                {t("newHerePrefix")}{" "}
                <Link
                  href={`/auth/register?redirect=${encodeURIComponent(redirect)}`}
                  className="text-primary hover:underline"
                >
                  {t("createAccount")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
