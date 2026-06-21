"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

type Status =
  | { kind: "checking" }
  | { kind: "success"; email: string }
  | { kind: "error"; reason: string }
  | { kind: "no_token" };

export default function VerifyEmailPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>(
    token ? { kind: "checking" } : { kind: "no_token" }
  );
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body?.ok) {
          setStatus({ kind: "success", email: String(body.email ?? "") });
        } else {
          setStatus({
            kind: "error",
            reason: String(body?.reason ?? "internal_error"),
          });
        }
      } catch {
        if (!cancelled) setStatus({ kind: "error", reason: "network_error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const resend = useCallback(async () => {
    setResending(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      const res = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(at ? { authorization: `Bearer ${at}` } : {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast.info("Please sign in first, then click resend.");
        router.push(
          `/auth/login?redirect=${encodeURIComponent("/auth/verify-email")}`
        );
        return;
      }
      if (!res.ok || body?.ok === false) {
        toast.error(body?.message || "Could not send the email. Please try again.");
        return;
      }
      if (body?.alreadyVerified) {
        toast.success("Your email is already verified.");
        router.push("/account");
        return;
      }
      toast.success("Verification email sent — check your inbox.");
    } finally {
      setResending(false);
    }
  }, [router]);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>
              {status.kind === "success"
                ? "Email verified"
                : status.kind === "checking"
                  ? "Verifying your email…"
                  : "Verify your email"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {status.kind === "checking" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming your link, one moment…
              </p>
            )}

            {status.kind === "success" && (
              <>
                <p className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>{status.email}</strong> is now verified. You can
                    use all features of your account.
                  </span>
                </p>
                <div className="flex gap-2 pt-2">
                  <Button asChild>
                    <Link href="/account">Go to my account</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/">Continue shopping</Link>
                  </Button>
                </div>
              </>
            )}

            {status.kind === "error" && (
              <>
                <p className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>
                    {status.reason === "expired"
                      ? "This verification link has expired. Request a fresh one below."
                      : status.reason === "used"
                        ? "This link has already been used. If your email isn't verified yet, request a new link below."
                        : "We couldn't verify this link. It may have been replaced by a newer one."}
                  </span>
                </p>
                <Button onClick={resend} disabled={resending}>
                  {resending ? "Sending…" : "Resend verification email"}
                </Button>
              </>
            )}

            {status.kind === "no_token" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Click the link in your verification email to confirm your
                  address. Didn&apos;t get one? Request a fresh email below.
                </p>
                <Button onClick={resend} disabled={resending}>
                  {resending ? "Sending…" : "Resend verification email"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
