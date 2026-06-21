"use client";

// EmailVerificationBanner
//
// Renders one of three states based on the signed-in user's
// verification stage:
//   - "soft"     → slim banner across the top, dismissible per-session
//   - "warning"  → prominent sticky banner with countdown
//   - "locked"   → full-screen soft-lock modal that blocks non-browsing
//                  actions (browsing still works behind it; the modal
//                  itself is the gate)
//
// `verified` and staff (role admin/super_admin/vendor) render nothing.
//
// Status polls via /api/me/email-verification-status. We refetch on
// pathname change so the banner reflects a state change after the
// user clicks the link (e.g., banner disappears after they verify).

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Mail, AlertCircle, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Status = {
  authenticated: boolean;
  verified?: boolean;
  stage?: "verified" | "soft" | "warning" | "locked";
  daysUntilLockout?: number | null;
};

// Per-session dismiss for the "soft" stage only. Warning + locked are
// always shown — too important to hide.
const SESSION_DISMISS_KEY = "mik_verify_banner_dismissed_v1";

export function EmailVerificationBanner() {
  const pathname = usePathname() ?? "/";
  const [status, setStatus] = useState<Status | null>(null);
  const [resending, setResending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      const res = await fetch("/api/me/email-verification-status", {
        credentials: "include",
        headers: at ? { authorization: `Bearer ${at}` } : undefined,
        cache: "no-store",
      });
      if (!res.ok) {
        setStatus(null);
        return;
      }
      const body = (await res.json()) as Status;
      setStatus(body);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus, pathname]);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(SESSION_DISMISS_KEY) === "1");
    } catch {
      /* SSR / private mode */
    }
  }, []);

  const resend = async () => {
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
      if (!res.ok || body?.ok === false) {
        toast.error(body?.message || "Could not send. Try again in a moment.");
        return;
      }
      if (body?.alreadyVerified) {
        toast.success("Your email is already verified.");
        await fetchStatus();
        return;
      }
      toast.success("Verification email sent — check your inbox.");
    } finally {
      setResending(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
  };

  if (!status?.authenticated) return null;
  if (status.stage === "verified" || status.verified) return null;

  // Hide on the verify-email page itself (user is already verifying) and
  // on auth routes (login / register / reset / forgot / callback).
  if (
    pathname.startsWith("/auth/verify-email") ||
    pathname === "/auth/login" ||
    pathname === "/auth/register" ||
    pathname.startsWith("/auth/reset") ||
    pathname.startsWith("/auth/forgot") ||
    pathname.startsWith("/auth/callback")
  ) {
    return null;
  }

  const daysLeft = status.daysUntilLockout ?? null;

  // LOCKED → full-screen soft-lock modal
  if (status.stage === "locked") {
    return (
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              <DialogTitle>Email verification required</DialogTitle>
            </div>
            <DialogDescription>
              Your verification window has ended. To continue using your
              account, please verify your email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              Browsing still works — but cart, checkout, reviews, partnerships,
              and account changes are paused until your email is confirmed.
            </p>
            <p>
              If you didn&apos;t receive an email, click below to send a fresh
              link.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="outline">
              <Link href="/">Continue browsing</Link>
            </Button>
            <Button onClick={resend} disabled={resending}>
              <Mail className="mr-2 h-4 w-4" />
              {resending ? "Sending…" : "Resend verification email"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // WARNING → prominent sticky banner with countdown
  if (status.stage === "warning") {
    return (
      <div className="sticky top-0 z-30 w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow-sm">
        <div className="container mx-auto flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              <strong>Verify your email soon.</strong>{" "}
              {daysLeft !== null && daysLeft > 0
                ? `You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} left before your account is paused.`
                : "Your account will be paused shortly."}
            </span>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-700 bg-white text-amber-900 hover:bg-amber-50"
            onClick={resend}
            disabled={resending}
          >
            <Mail className="mr-2 h-3.5 w-3.5" />
            {resending ? "Sending…" : "Resend email"}
          </Button>
        </div>
      </div>
    );
  }

  // SOFT → slim banner, dismissible per-session
  if (status.stage === "soft" && !dismissed) {
    return (
      <div className="w-full border-b border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-900">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <p className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Please verify your email to unlock checkout, reviews, and
              partnership tools.
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="font-medium underline-offset-2 hover:underline disabled:opacity-50"
              onClick={resend}
              disabled={resending}
            >
              {resending ? "Sending…" : "Send link"}
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="rounded p-0.5 hover:bg-blue-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default EmailVerificationBanner;
