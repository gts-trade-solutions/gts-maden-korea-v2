"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { supabase } from "@/lib/supabaseClient";

// Client auth-backend flag (mirrors server AUTH_BACKEND). Unset = Supabase.
const NEXTAUTH = process.env.NEXT_PUBLIC_AUTH_BACKEND === "nextauth";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import {
  SUPPORTED_COUNTRIES,
  COUNTRY_PROFILES,
  isSupportedCountry,
  DEFAULT_COUNTRY,
  type CountryCode,
} from "@/lib/countries";

// Read mik_country from document.cookie at mount so the country
// dropdown defaults to whatever middleware seeded from geo (or the
// country switcher set). Falls back to DEFAULT_COUNTRY if absent.
function readCountryFromCookie(): CountryCode {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

// Browser Supabase client
/* -------------------------------------------------------------------------- */
/*                         PASSWORD VALIDATION HELPERS                        */
/* -------------------------------------------------------------------------- */
function hasLower(s: string) { return /[a-z]/.test(s); }
function hasUpper(s: string) { return /[A-Z]/.test(s); }
function hasNumber(s: string) { return /\d/.test(s); }
function hasSymbol(s: string) { return /[^A-Za-z0-9\s]/.test(s); }
function hasSequence(s: string) {
  return /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|asdf|zxcv)/i.test(s);
}
function hasRepeat(s: string) { return /(.)\1{2,}/.test(s); }

// Strength tips are returned as stable IDs (not translated text) so the
// caller can resolve them via useTranslations() — this lets the same
// helper work across every locale without re-running on locale change.
type StrengthTipId =
  | "tipLonger"
  | "tipUppercase"
  | "tipNumber"
  | "tipSymbol"
  | "tipNoSequence"
  | "tipNoRepeat";

const STRENGTH_LABEL_KEYS = [
  "strengthTooWeak",
  "strengthWeak",
  "strengthOkay",
  "strengthStrong",
  "strengthVeryStrong",
] as const;

function scorePassword(pw: string) {
  const tips: StrengthTipId[] = [];
  if (!pw) {
    return { score: 0, labelKey: STRENGTH_LABEL_KEYS[0], tips: ["tipLonger" as StrengthTipId] };
  }

  let score = 0;

  if (pw.length >= 15) score += 3;
  else if (pw.length >= 11) score += 2;
  else if (pw.length >= 8) score += 1;

  const varieties = [
    hasLower(pw),
    hasUpper(pw),
    hasNumber(pw),
    hasSymbol(pw),
  ].filter(Boolean).length;

  score += Math.max(0, varieties - 1);

  if (hasSequence(pw)) score -= 1;
  if (hasRepeat(pw)) score -= 1;

  score = Math.max(0, Math.min(4, score));

  if (pw.length < 12) tips.push("tipLonger");
  if (!hasUpper(pw)) tips.push("tipUppercase");
  if (!hasNumber(pw)) tips.push("tipNumber");
  if (!hasSymbol(pw)) tips.push("tipSymbol");
  if (hasSequence(pw)) tips.push("tipNoSequence");
  if (hasRepeat(pw)) tips.push("tipNoRepeat");

  return { score, labelKey: STRENGTH_LABEL_KEYS[score], tips };
}

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

function segClass(active: boolean, idx: number, score: number) {
  if (!active) return "bg-muted";
  return [
    "bg-red-500",
    score >= 2 ? "bg-orange-500" : "bg-red-500",
    score >= 3 ? "bg-yellow-500" : "bg-orange-500",
    score >= 4 ? "bg-emerald-500" : "bg-yellow-500",
  ][idx];
}

export default function RegisterPage() {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations("auth.signUp");
  const tIn = useTranslations("auth.signIn");
  const tLinks = useTranslations("footer.links");

  const redirect = params.get("redirect") || "/account";
  const mode = params.get("mode");

  /* OAuth buttons loading state */
  const [oauthLoading, setOauthLoading] = useState<"google" | "facebook" | null>(null);

  /* Original form states */
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm: "",
  });

  // Country picker — required. Defaults to the visitor's geo-detected
  // country so most users won't need to change it. Stored separately
  // from `form` because it's a select, not a text input, and so we
  // can lazily pick a default from the cookie on first render without
  // re-running it on every keystroke.
  const [country, setCountry] = useState<CountryCode>(() =>
    readCountryFromCookie()
  );

  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  const strength = useMemo(() => scorePassword(form.password), [form.password]);
  const meetsMin = form.password.length >= 8;
  const hasU = hasUpper(form.password);
  const hasN = hasNumber(form.password);
  const hasS = hasSymbol(form.password);
  const match = !!form.password && form.password === form.confirm;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  /* Attach SSR cookies */
  const attachAfterAuth = async () => {
    const { data: s } = await supabase.auth.getSession();
    const at = s?.session?.access_token;
    const rt = s?.session?.refresh_token;

    if (!at || !rt) return;

    await fetch("/api/auth/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ access_token: at, refresh_token: rt }),
    }).catch(() => {});
  };

  /* -------------------------------------------------------------------------- */
  /*                               OAUTH HANDLERS                               */
  /* -------------------------------------------------------------------------- */
  const loginWithProvider = async (provider: "google" | "facebook") => {
    try {
      setOauthLoading(provider);

      const redirectParam = redirect || "/account";

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(
            redirectParam
          )}`,
        },
      });

      if (error) {
        toast.error(error.message || `Could not start ${provider} sign in`);
        setOauthLoading(null);
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong, please try again.");
      setOauthLoading(null);
    }
  };

  const handleGoogleLogin = () => loginWithProvider("google");
  const handleFacebookLogin = () => loginWithProvider("facebook");

  /* -------------------------------------------------------------------------- */
  /*                           FORM SUBMIT HANDLER                               */
  /* -------------------------------------------------------------------------- */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agree) {
      toast.error(t("errAgree"));
      return;
    }
    if (!meetsMin || !hasU || !hasN || !hasS) {
      toast.error(t("errPasswordRequirements"));
      return;
    }
    if (!match) {
      toast.error(t("errPasswordsMismatch"));
      return;
    }
    if (!isSupportedCountry(country)) {
      toast.error("Please pick your country before continuing.");
      return;
    }

    setSubmitting(true);
    setVerificationNotice(null);

    const email = form.email.trim();
    const password = form.password;

    try {
      // Dual-write registration (Option 1): the route creates the account in
      // BOTH Supabase Auth and MySQL with the SAME id. Always-on during the
      // transition so users registering now can also log in via NextAuth after
      // the auth flip (and the vendor app keeps seeing them in Supabase).
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, full_name: form.full_name }),
      });
      const regJson = await regRes.json().catch(() => ({} as any));
      if (!regRes.ok || !regJson?.ok) {
        const code = regJson?.error;
        toast.error(
          code === "EMAIL_EXISTS"
            ? "An account with this email already exists."
            : code === "WEAK_PASSWORD"
              ? "Password must be at least 6 characters."
              : code || t("errGeneric")
        );
        return;
      }

      // Establish a session. Backend-aware: NextAuth at the flip, Supabase now.
      if (NEXTAUTH) {
        const si = await signIn("credentials", { email, password, redirect: false });
        if (si?.error) {
          toast.success(t("successToast"));
          router.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
          return;
        }
      } else {
        const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
        if (siErr) {
          toast.success(t("successToast"));
          router.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
          return;
        }
        await attachAfterAuth();
      }

      // Build request headers — Supabase bearer for the legacy flow, none under
      // NextAuth (the session cookie carries auth there).
      const bearerHeaders = async (): Promise<Record<string, string>> => {
        const h: Record<string, string> = { "content-type": "application/json" };
        if (!NEXTAUTH) {
          try {
            const { data: s } = await supabase.auth.getSession();
            const at = s?.session?.access_token;
            if (at) h.Authorization = `Bearer ${at}`;
          } catch {}
        }
        return h;
      };

      // Persist the chosen country to the profile + cookies (best-effort).
      try {
        await fetch("/api/me/country", {
          method: "POST",
          credentials: "include",
          headers: await bearerHeaders(),
          body: JSON.stringify({ country }),
        });
      } catch {}

      // Stitch pre-signup anonymous activity onto the new user_id.
      void fetch("/api/events/identify", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "signup" }),
      }).catch(() => {});

      // Custom verification email + welcome email — both best-effort.
      void (async () => {
        try {
          const headers = await bearerHeaders();
          await Promise.all([
            fetch("/api/auth/verify-email/resend", { method: "POST", credentials: "include", headers }),
            fetch("/api/auth/welcome-email", { method: "POST", credentials: "include", headers }),
          ]);
        } catch {
          /* best-effort */
        }
      })();

      toast.success(t("successToast"));
      router.replace(mode === "influencer" ? "/influencer-request" : redirect);
    } catch (err: any) {
      toast.error(err.message || t("errGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                    UI                                      */
  /* -------------------------------------------------------------------------- */
  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            <CardContent className="space-y-5">

              {/* OAuth at the top — fastest path to an account. Email
                  form sits below the divider as a secondary option. */}
              <div className="space-y-2">
                <Button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={oauthLoading !== null}
                  className="w-full bg-white text-black border border-gray-300 hover:bg-gray-50 justify-center gap-2"
                >
                  <GoogleLogo />
                  {oauthLoading === "google"
                    ? tIn("redirectingToGoogle")
                    : tIn("continueWithGoogle")}
                </Button>
                <Button
                  type="button"
                  onClick={handleFacebookLogin}
                  disabled={oauthLoading !== null}
                  className="w-full bg-[#1877F2] text-white hover:bg-[#166FE5] justify-center gap-2"
                >
                  <FacebookLogo />
                  {oauthLoading === "facebook"
                    ? tIn("redirectingToFacebook")
                    : tIn("continueWithFacebook")}
                </Button>
              </div>

              <div className="relative flex items-center py-1">
                <div className="flex-1 border-t" />
                <span className="px-2 text-xs text-muted-foreground">
                  {tIn("orWithEmail")}
                </span>
                <div className="flex-1 border-t" />
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="full_name">{t("fullNameLabel")}</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  value={form.full_name}
                  onChange={onChange}
                  required
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={onChange}
                  required
                />
              </div>

              {/* Country — required. The post-signup flow writes this
                  to the user's profile + mik_country cookie, so they
                  skip the CountryGate modal that catches existing
                  users without a country. */}
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <select
                  id="country"
                  name="country"
                  value={country}
                  onChange={(e) =>
                    setCountry(e.target.value as CountryCode)
                  }
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {SUPPORTED_COUNTRIES.map((code) => {
                    const profile = COUNTRY_PROFILES[code];
                    // <option> content is plain text only — show name.
                    return (
                      <option key={code} value={code}>
                        {profile?.name ?? code}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Used to show you the right prices, shipping, and
                  offers. You can change this later in the header.
                </p>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    name="password"
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={onChange}
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowPw((v) => !v)}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Strength Meter */}
                <div className="mt-2">
                  <div className="flex gap-1 h-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded ${segClass(
                          i <= strength.score - 1,
                          i,
                          strength.score
                        )}`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{t(strength.labelKey)}</span>
                    <span className="text-muted-foreground">
                      {t("charsCount", { count: form.password.length })}
                    </span>
                  </div>

                  <ul className="mt-2 space-y-1 text-xs">
                    <li className="flex items-center gap-1">
                      {meetsMin ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {t("requireMinLength")}
                    </li>

                    <li className="flex items-center gap-1">
                      {hasU ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {t("requireUppercase")}
                    </li>

                    <li className="flex items-center gap-1">
                      {hasN ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {t("requireNumber")}
                    </li>

                    <li className="flex items-center gap-1">
                      {hasS ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {t("requireSymbol")}
                    </li>
                  </ul>

                  {strength.score < 3 && strength.tips.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {t("tipsPrefix")} {strength.tips.slice(0, 3).map((id) => t(id)).join(" • ")}
                    </div>
                  )}
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm">{t("confirmPasswordLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="confirm"
                    name="confirm"
                    type={showConfirm ? "text" : "password"}
                    value={form.confirm}
                    onChange={onChange}
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {form.confirm.length > 0 && (
                  <p
                    className={`text-xs mt-1 ${
                      match ? "text-emerald-600" : "text-destructive"
                    }`}
                  >
                    {match ? t("passwordsMatch") : t("passwordsDoNotMatch")}
                  </p>
                )}
              </div>

              {/* Country — required at signup so we know which prices,
                  K-Partnership offers, and shipping rules apply to the
                  user from their very first interaction. Pre-filled
                  from the visitor's mik_country cookie (geo-detected
                  by middleware), so most users just confirm. */}
              <div className="space-y-2">
                <Label htmlFor="signup-country">Country</Label>
                <select
                  id="signup-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value as CountryCode)}
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm h-10"
                >
                  {SUPPORTED_COUNTRIES.map((code) => {
                    const profile = COUNTRY_PROFILES[code];
                    // <option> content is plain text only — show name.
                    return (
                      <option key={code} value={code}>
                        {profile?.name ?? code}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  You can change this anytime from the country selector
                  in the header.
                </p>
              </div>

              {/* Terms */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="agree"
                  checked={agree}
                  onCheckedChange={(v: any) => setAgree(!!v)}
                />
                <label htmlFor="agree" className="text-sm text-muted-foreground">
                  {t("agreePrefix")}{" "}
                  <Link href="/terms" className="text-primary hover:underline">
                    {tLinks("terms")}
                  </Link>{" "}
                  {t("agreeAnd")}{" "}
                  <Link href="/privacy" className="text-primary hover:underline">
                    {tLinks("privacy")}
                  </Link>
                  {t("agreeSuffix")}
                </label>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("submitting") : t("submit")}
              </Button>
              {verificationNotice ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {verificationNotice}
                </p>
              ) : null}
            </CardContent>

            <CardFooter className="flex flex-col gap-4">


              <p className="text-sm text-center text-muted-foreground">
                {t("alreadyHaveAccountPrefix")}{" "}
                <Link
                  href={`/auth/login?redirect=${encodeURIComponent(redirect)}`}
                  className="text-primary hover:underline"
                >
                  {t("signInLink")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
