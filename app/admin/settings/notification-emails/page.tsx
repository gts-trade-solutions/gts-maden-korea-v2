"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

// Admin-managed list of email addresses that receive internal/admin
// notifications: order placed, payout request, contact form
// submission, international order request. Single flat list — all
// admins get all notification kinds.
//
// Backed by /api/admin/settings/notification-emails which writes
// `public.notification_recipients`.

type Recipient = {
  id: string;
  email: string;
  label: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export default function NotificationEmailsPage() {
  const router = useRouter();
  const { hasRole, ready } = useAuth();

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoadError(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/settings/notification-emails", {
        credentials: "include",
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        const msg = body.error || `HTTP ${res.status}`;
        setLoadError(msg);
        toast.error(msg);
        return;
      }
      setRecipients(body.recipients ?? []);
    } catch (e: any) {
      const msg = e?.message || "Failed to load recipients";
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Wait for auth to resolve before deciding to redirect; without
    // this, the first render sees hasRole=false (user not loaded) and
    // we'd kick admins to /admin before their session lands.
    if (!ready) return;
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasRole, router]);

  if (!ready) {
    return (
      <>
        <AdminBackBar to="/admin/settings" title="Notification Emails" />
        <div className="container mx-auto py-6 max-w-3xl">
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      </>
    );
  }
  if (!hasRole("admin")) return null;

  const addRecipient = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Email is required");
      return;
    }
    setAdding(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/settings/notification-emails", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email,
          label: newLabel.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || "Failed to add");
        return;
      }
      toast.success(`Added ${email}`);
      setNewEmail("");
      setNewLabel("");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    // Optimistic update — flip the toggle straight away, roll back on
    // failure. Admins want the UI to feel instant for a one-bit edit.
    const prev = recipients;
    setRecipients((rs) =>
      rs.map((r) => (r.id === id ? { ...r, active } : r))
    );
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch("/api/admin/settings/notification-emails", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ id, active }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        setRecipients(prev);
        toast.error(body.error || "Update failed");
      }
    } catch (e: any) {
      setRecipients(prev);
      toast.error(e?.message || "Update failed");
    }
  };

  const removeRecipient = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from admin notifications?`)) return;
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(
        `/api/admin/settings/notification-emails?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || "Remove failed");
        return;
      }
      toast.success(`Removed ${email}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Remove failed");
    }
  };

  const activeCount = recipients.filter((r) => r.active).length;

  return (
    <>
      <AdminBackBar to="/admin/settings" title="Notification Emails" />

      <div className="container mx-auto py-6 max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Email addresses that receive admin/internal notifications when a
          customer places an order, submits the contact form, requests a
          payout, or files an international order request. The first active
          entry is used as the primary <code>To</code>; the rest are CC&apos;d.
        </p>

        <div className="text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : `${activeCount} active · ${recipients.length} total`}
        </div>

        {loadError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <strong>Couldn’t load recipients.</strong>
            <p className="mt-1 text-xs font-mono">{loadError}</p>
          </div>
        )}

        {/* Add new */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Add recipient</h3>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                type="email"
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <Input
                type="text"
                placeholder="Label (optional, e.g. Operations)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <Button onClick={addRecipient} disabled={adding || !newEmail}>
                {adding ? "Adding…" : "Add"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Existing list */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Label</th>
                  <th className="text-left px-4 py-3 font-medium">Active</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && recipients.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No recipients yet. Admin emails won&apos;t be sent until
                      you add at least one.
                    </td>
                  </tr>
                )}
                {recipients.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{r.email}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {r.label || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={r.active}
                        onCheckedChange={(v) => toggleActive(r.id, v)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-700 hover:text-red-800 hover:bg-red-50"
                        onClick={() => removeRecipient(r.id, r.email)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Tip: toggling <em>Active</em> off keeps the row but stops sending to
          it. Use <strong>Remove</strong> for permanent deletion.
        </p>
      </div>
    </>
  );
}
