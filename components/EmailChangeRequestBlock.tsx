"use client";

// EmailChangeRequestBlock
//
// Drops into the account settings page directly under the (disabled)
// email field. Surfaces the latest request's status if any, plus a
// "Request email change" button that opens a small dialog.
//
// Pending request → status pill + reminder message. Admin-rejected
// request → small alert with the admin's reason. Anything else → CTA
// to start a new request.

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, AlertCircle, MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

type RequestRow = {
  id: string;
  current_email: string;
  requested_email: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  reason: string | null;
  admin_note: string | null;
  requested_at: string;
  processed_at: string | null;
};

export function EmailChangeRequestBlock() {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ requestedEmail: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      const res = await fetch("/api/me/email-change-request", {
        method: "GET",
        credentials: "include",
        headers: at ? { authorization: `Bearer ${at}` } : undefined,
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      setRequest((body?.request as RequestRow) ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const requestedEmail = form.requestedEmail.trim();
    if (!requestedEmail) {
      toast.error("Enter the new email address.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      const res = await fetch("/api/me/email-change-request", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(at ? { authorization: `Bearer ${at}` } : {}),
        },
        body: JSON.stringify({
          requestedEmail,
          reason: form.reason.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        const reason = body?.reason ?? "internal_error";
        const messages: Record<string, string> = {
          invalid_email: "That email doesn't look right.",
          same_email: "That's your current email.",
          email_taken: "Another account is already using that email.",
          rate_limited:
            body?.message || "You've reached the 3-request limit for this week.",
        };
        toast.error(messages[reason] || "Could not submit. Try again.");
        return;
      }
      toast.success("Request submitted. We'll review it and email you.");
      setOpen(false);
      setForm({ requestedEmail: "", reason: "" });
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground">
        Checking email change status…
      </p>
    );
  }

  const isPending = request?.status === "pending";
  const isRejected = request?.status === "rejected";

  return (
    <div className="space-y-2">
      {isPending && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p>
              <strong>Email change pending review.</strong> Requested:{" "}
              <span className="font-medium">{request!.requested_email}</span>
            </p>
            <p className="text-amber-700">
              Admin will approve or reject this request soon. Once approved,
              you&apos;ll receive a verification link at the new address.
            </p>
          </div>
        </div>
      )}

      {isRejected && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p>
              <strong>Last request rejected.</strong> Requested:{" "}
              <span className="font-medium">{request!.requested_email}</span>
            </p>
            {request!.admin_note && (
              <p className="text-red-800">Reason: {request!.admin_note}</p>
            )}
          </div>
        </div>
      )}

      {request?.status === "approved" && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>
            <strong>Previous change approved.</strong> Make sure the new
            address ({request.requested_email}) is verified.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          To change your email, submit a request — an admin will review and
          approve it. You can&apos;t edit your email directly.
        </p>
        {!isPending && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <MailCheck className="mr-2 h-3.5 w-3.5" />
            Request email change
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request email change</DialogTitle>
            <DialogDescription>
              Enter the new address you&apos;d like to use. We&apos;ll review
              your request and, once approved, send a verification link to
              the new address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-email">New email address</Label>
              <Input
                id="new-email"
                type="email"
                value={form.requestedEmail}
                onChange={(e) =>
                  setForm((f) => ({ ...f, requestedEmail: e.target.value }))
                }
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason" className="flex items-baseline justify-between">
                <span>Reason</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Optional
                </span>
              </Label>
              <Textarea
                id="reason"
                rows={3}
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
                placeholder="Helps the admin approve faster (e.g. switched workplaces)."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EmailChangeRequestBlock;
