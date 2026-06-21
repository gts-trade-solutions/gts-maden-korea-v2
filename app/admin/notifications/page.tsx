"use client";

// /admin/notifications — full history view.
//
// Larger version of the bell popover: shows up to 100 most recent
// notifications, with a filter for unread-only and a mark-all-read
// button. Each item is clickable just like in the popover.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: "info" | "warning" | "critical";
  meta: any;
  created_at: string;
  read: boolean;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function severityIcon(s: Notification["severity"]) {
  const cls = "h-4 w-4";
  if (s === "critical")
    return <AlertCircle className={`${cls} text-red-600`} />;
  if (s === "warning")
    return <AlertTriangle className={`${cls} text-amber-600`} />;
  return <Info className={`${cls} text-blue-600`} />;
}

const TYPE_LABELS: Record<string, string> = {
  order_placed: "Order",
  email_change_requested: "Email change",
  kpartnership_requested: "K-Partnership",
  intl_order_requested: "Intl order",
  contact_submitted: "Contact",
  payout_requested: "Payout",
  user_signed_up: "New user",
  vendor_signed_up: "New vendor",
};

export default function AdminNotificationsPage() {
  const router = useRouter();
  const { hasRole, ready } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      const params = new URLSearchParams({ limit: "100" });
      if (unreadOnly) params.set("unread_only", "1");
      const res = await fetch(`/api/admin/notifications?${params}`, {
        credentials: "include",
        headers: at ? { authorization: `Bearer ${at}` } : undefined,
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        toast.error(body?.error || "Failed to load notifications");
        return;
      }
      setItems((body.items as Notification[]) ?? []);
      setUnread(Number(body.unread_count) || 0);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    if (!ready) return;
    if (!hasRole("admin")) {
      router.push("/admin");
      return;
    }
    void fetchFeed();
  }, [ready, hasRole, router, fetchFeed]);

  const markRead = async (id: string, alreadyRead: boolean) => {
    if (alreadyRead) return;
    try {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      await fetch(`/api/admin/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST",
        credentials: "include",
        headers: at ? { authorization: `Bearer ${at}` } : undefined,
      });
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* best-effort */
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      const res = await fetch("/api/admin/notifications/read-all", {
        method: "POST",
        credentials: "include",
        headers: at ? { authorization: `Bearer ${at}` } : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        toast.error(body?.error || "Couldn't mark all read");
        return;
      }
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } finally {
      setMarkingAll(false);
    }
  };

  const onItemClick = (n: Notification) => {
    void markRead(n.id, n.read);
    if (n.link) router.push(n.link);
  };

  if (!ready) {
    return (
      <>
        <AdminBackBar to="/admin" title="Notifications" />
        <div className="container mx-auto py-6 max-w-4xl">
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      </>
    );
  }
  if (!hasRole("admin")) return null;

  return (
    <>
      <AdminBackBar to="/admin" title="Notifications" />
      <div className="container mx-auto py-6 space-y-4 max-w-4xl px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {unread > 0
              ? `${unread} unread of ${items.length} shown`
              : `${items.length} notifications`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant={unreadOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setUnreadOnly((v) => !v)}
            >
              <Bell className="h-3.5 w-3.5 mr-1" />
              {unreadOnly ? "Showing unread" : "Show all"}
            </Button>
            {unread > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAll}
                disabled={markingAll}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                {markingAll ? "Marking…" : "Mark all read"}
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                {unreadOnly
                  ? "Nothing unread. Toggle to see all."
                  : "No notifications yet. Activity will appear here as it happens."}
              </div>
            ) : (
              <ul className="divide-y">
                {items.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => onItemClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer ${
                      n.read ? "opacity-70" : ""
                    }`}
                  >
                    <span className="mt-0.5 flex-shrink-0">
                      {severityIcon(n.severity)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm leading-snug ${
                            n.read ? "text-muted-foreground" : "font-medium"
                          }`}
                        >
                          {n.title}
                        </p>
                        {!n.read && (
                          <span
                            className="mt-1 flex-shrink-0 h-2 w-2 rounded-full bg-red-500"
                            aria-label="Unread"
                          />
                        )}
                      </div>
                      {n.body && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {TYPE_LABELS[n.type] || n.type}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatDate(n.created_at)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
