"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  installAnalyticsAutoFlush,
  trackEvent,
} from "@/lib/analytics/track";

/**
 * Mounted once at the root of the app shell. Installs the unload-time
 * flush handler and emits a `page_view` whenever the route changes.
 * The hits hit `/api/events/track`, which performs identity assignment
 * (anon_id + session_id cookies) on first contact.
 */
export function AnalyticsBootstrap() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    installAnalyticsAutoFlush();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const full = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    if (lastPath.current === full) return;
    lastPath.current = full;
    trackEvent("page_view", { title: document.title });
  }, [pathname, searchParams]);

  return null;
}
