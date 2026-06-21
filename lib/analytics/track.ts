"use client";

import type { KnownEvent } from "@/lib/analytics/events";

type TrackPayload = {
  event_name: KnownEvent;
  path?: string | null;
  referrer?: string | null;
  utm?: Record<string, string> | null;
  props?: Record<string, any> | null;
};

const ENDPOINT = "/api/events/track";
const FLUSH_INTERVAL_MS = 1500;

let queue: TrackPayload[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function readUtmFromUrl(): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  const u = new URL(window.location.href);
  const out: Record<string, string> = {};
  for (const k of ["source", "medium", "campaign", "term", "content"]) {
    const v = u.searchParams.get(`utm_${k}`);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

async function flush() {
  if (typeof window === "undefined") return;
  if (!queue.length) return;
  const events = queue;
  queue = [];
  flushTimer = null;
  try {
    const body = JSON.stringify({ events });
    // sendBeacon won't run during flush() because it doesn't support
    // application/json reliably. Use it from pagehide handlers below.
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      credentials: "include",
      keepalive: true,
    });
  } catch {
    // Drop on failure — analytics must never block the user path.
  }
}

function schedule() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

/**
 * Fire-and-forget event emission. Adds to a 1.5-second batch then
 * POSTs to /api/events/track. Safe to call from any client component.
 */
export function trackEvent(
  event_name: KnownEvent,
  props: Record<string, any> = {},
  opts: { immediate?: boolean } = {}
) {
  if (typeof window === "undefined") return;

  const payload: TrackPayload = {
    event_name,
    path: window.location.pathname + window.location.search,
    referrer: document.referrer || null,
    utm: readUtmFromUrl(),
    props,
  };

  queue.push(payload);

  if (opts.immediate) {
    void flush();
  } else {
    schedule();
  }
}

/**
 * Browser-side init — flush any pending events when the tab is closed
 * so we don't lose `payment_cancelled`, `pay_clicked`, etc.
 */
export function installAnalyticsAutoFlush() {
  if (typeof window === "undefined") return;
  if ((window as any).__mikAnalyticsInstalled) return;
  (window as any).__mikAnalyticsInstalled = true;

  const flushOnHide = () => {
    if (!queue.length) return;
    const body = JSON.stringify({ events: queue });
    queue = [];
    try {
      // sendBeacon needs a Blob; many browsers won't accept JSON content-type
      // headers from fetch keepalive at unload time, so prefer Blob here.
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
    } catch {
      // Best effort — drop if we cannot ship.
    }
  };

  window.addEventListener("pagehide", flushOnHide);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnHide();
  });
}
