"use client";

// NotificationBell
//
// Renders a bell icon with an unread-count badge in the admin chrome.
// Clicking opens a popover with a recent feed; clicking a row navigates
// to the linked admin page AND marks it read. Polls the notifications
// API every 30 s so the bell stays roughly fresh without burning quota.
//
// Used in:
//   - app/admin/page.tsx (dashboard header right cluster)
//   - components/admin/AdminBackBar.tsx (right slot on sub-pages)
//
// Auth: the component itself doesn't check role — it just calls the
// admin-only API, which returns 403 to non-admins. Showing the
// component on non-admin layouts would still be safe (badge stays 0).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 30_000;

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

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

function severityIcon(s: Notification["severity"]) {
  const cls = "h-3.5 w-3.5";
  if (s === "critical")
    return <AlertCircle className={`${cls} text-red-600`} />;
  if (s === "warning")
    return <AlertTriangle className={`${cls} text-amber-600`} />;
  return <Info className={`${cls} text-blue-600`} />;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchFeed = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      const res = await fetch("/api/admin/notifications?limit=20", {
        credentials: "include",
        headers: at ? { authorization: `Bearer ${at}` } : undefined,
        cache: "no-store",
      });
      if (!res.ok) return; // silent — bell stays at last known state
      const body = await res.json().catch(() => ({}));
      if (body?.ok) {
        setItems((body.items as Notification[]) ?? []);
        setUnread(Number(body.unread_count) || 0);
      }
    } catch {
      /* silent */
    }
  }, []);

  // Initial fetch + 30 s polling.
  useEffect(() => {
    void fetchFeed();
    const handle = setInterval(() => void fetchFeed(), POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [fetchFeed]);

  // Refetch when popover opens — gives the freshest data on click.
  useEffect(() => {
    if (open) void fetchFeed();
  }, [open, fetchFeed]);

  const markRead = useCallback(async (id: string) => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const at = s?.session?.access_token;
      await fetch(`/api/admin/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST",
        credentials: "include",
        headers: at ? { authorization: `Bearer ${at}` } : undefined,
      });
      // Optimistic local update.
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, read: true } : it))
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* best-effort */
    }
  }, []);

  const markAll = useCallback(async () => {
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
      setItems((prev) => prev.map((it) => ({ ...it, read: true })));
      setUnread(0);
    } finally {
      setMarkingAll(false);
    }
  }, []);

  const onItemClick = (n: Notification) => {
    if (!n.read) void markRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const badgeLabel = unread > 99 ? "99+" : String(unread);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-9 w-9 p-0"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
              aria-hidden="true"
            >
              {badgeLabel}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(380px,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">
              {unread > 0
                ? `${unread} unread`
                : items.length > 0
                  ? "All caught up"
                  : "No notifications yet"}
            </p>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAll}
              disabled={markingAll}
              className="text-xs h-7"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              {markingAll ? "Marking…" : "Mark all read"}
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[420px]">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nothing here yet. New activity will show up automatically.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const Body = (
                  <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 cursor-pointer">
                    <span className="mt-0.5 flex-shrink-0">
                      {severityIcon(n.severity)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm leading-tight ${
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
                      <p className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id} onClick={() => onItemClick(n)}>
                    {Body}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="border-t px-4 py-2 text-center">
          <Link
            href="/admin/notifications"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationBell;
