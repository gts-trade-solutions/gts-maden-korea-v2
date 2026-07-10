"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Sparkles, Camera, ShieldCheck, Loader2 } from "lucide-react";

type Status =
  | { authed: false }
  | {
      authed: true;
      state:
        | { status: "ready"; remaining: number }
        | { status: "reserved"; grantId: string }
        | { status: "none" };
      lastAnalysisId: string | null;
      pendingRequest: boolean;
    };

export default function SkinAnalyzerPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [starting, setStarting] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/skin/status", { cache: "no-store" });
      setStatus(await r.json());
    } catch {
      setStatus({ authed: false });
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function start() {
    setStarting(true);
    try {
      const r = await fetch("/api/skin/start", { method: "POST" });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.message || "Could not start the analysis.");
        setStarting(false);
        return;
      }
      // Hand off to the analyzer (separate app).
      window.location.href = data.redirectUrl;
    } catch {
      toast.error("Something went wrong. Please try again.");
      setStarting(false);
    }
  }

  async function requestAccess() {
    setRequesting(true);
    try {
      const r = await fetch("/api/skin/request-access", { method: "POST" });
      const data = await r.json();
      if (!r.ok) toast.error(data.message || "Could not submit your request.");
      else {
        toast.success(
          data.alreadyPending
            ? "Your request is already pending review."
            : "Request submitted — we'll enable another analysis for you soon.",
        );
        await load();
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <CustomerLayout>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            AI Skin Analyzer
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Get a clear, in-the-moment read on your skin — key concerns and where
            to focus next. Your result is saved to your account.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Start your analysis</CardTitle>
            <CardDescription>
              Take a clear, front-facing selfie in good light. Best on your phone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderCta()}
            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Your photo is used only to run the analysis and is never stored —
                we keep just the results.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );

  function renderCta() {
    if (!status) {
      return (
        <Button disabled className="w-full">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </Button>
      );
    }

    if (!status.authed) {
      return (
        <div className="space-y-2">
          <Button asChild className="w-full">
            <Link href="/auth/login?redirect=/skin-analyzer">
              Log in to analyze your skin
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            New here?{" "}
            <Link
              href="/auth/register?redirect=/skin-analyzer"
              className="underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      );
    }

    const { state, lastAnalysisId, pendingRequest } = status;
    const viewLast = lastAnalysisId ? (
      <Button asChild variant="outline" className="w-full">
        <Link href={`/account/skin-analysis/${lastAnalysisId}`}>
          View your last result
        </Link>
      </Button>
    ) : null;

    if (state.status === "ready" || state.status === "reserved") {
      return (
        <div className="space-y-2">
          <Button onClick={start} disabled={starting} className="w-full">
            {starting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            {state.status === "reserved"
              ? "Continue your analysis"
              : "Start analysis"}
          </Button>
          {viewLast}
        </div>
      );
    }

    // status === "none" → out of scans
    return (
      <div className="space-y-2">
        <p className="rounded-md bg-muted/50 p-3 text-center text-sm text-muted-foreground">
          You&apos;ve used your free analysis. Request access for another one.
        </p>
        <Button
          onClick={requestAccess}
          disabled={requesting || pendingRequest}
          className="w-full"
        >
          {requesting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {pendingRequest ? "Request pending review" : "Request another analysis"}
        </Button>
        {viewLast}
      </div>
    );
  }
}
