
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/account";

  const [checking, setChecking] = useState(true);

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

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (!data.session) {
          toast.error("Could not complete sign in. Please try again.");
          router.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
          return;
        }

        await attachAfterAuth();

        // Stitch pre-auth anonymous events onto the user_id and emit a
        // `login` marker. OAuth flow doesn't easily distinguish first-
        // time vs returning users from the client, so we always say
        // login here — minor analytics drift, acceptable.
        void fetch("/api/events/identify", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "login" }),
        }).catch(() => {});

        // OAuth signup onboarding: fires the welcome email + admin
        // bell + marks email_verified_at IF this looks like a fresh
        // OAuth signup. Idempotent for returning logins — the endpoint
        // checks profile age + the already-verified flag and no-ops
        // otherwise, so it's safe to call every time we land here.
        void (async () => {
          try {
            const { data: s } = await supabase.auth.getSession();
            const at = s?.session?.access_token;
            await fetch("/api/auth/oauth-signup-complete", {
              method: "POST",
              credentials: "include",
              headers: at ? { authorization: `Bearer ${at}` } : undefined,
            });
          } catch {
            /* best-effort */
          }
        })();

        router.replace(redirect);
      } catch (err) {
        console.error(err);
        toast.error("Something went wrong while signing you in.");
        router.replace(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
      } finally {
        setChecking(false);
      }
    })();
  }, [router, redirect]);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Signing you in…</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {checking
                ? "Completing your login. Please wait…"
                : "Redirecting…"}
            </p>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
