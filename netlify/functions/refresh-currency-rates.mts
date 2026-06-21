import type { Config } from "@netlify/functions";

// Netlify Scheduled Function: pings the Next.js API route once a day
// at 02:00 UTC so the `currency_rates` table stays fresh against the
// open.er-api.com feed.
//
// Why a thin proxy instead of doing the FX call here directly:
//  - All DB writes go through one code path (`/api/currency/refresh`).
//    Admins clicking "Refresh now" exercise the exact same logic.
//  - This function stays trivial — no env coupling to Supabase, just
//    a bearer-authed ping to our own API.
//
// Auth: passes `CRON_SECRET` as a bearer token. The API route accepts
// either that token OR a signed-in admin session.

const SITE_URL =
  process.env.SITE_URL ||
  process.env.URL ||
  "https://madenkorea.com";

export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET not set; skipping refresh");
    return new Response("CRON_SECRET missing", { status: 500 });
  }

  const url = `${SITE_URL.replace(/\/$/, "")}/api/currency/refresh`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[cron] refresh failed ${res.status}:`, body);
      return new Response(body, { status: res.status });
    }
    console.log(`[cron] refresh ok:`, body);
    return new Response(body, { status: 200 });
  } catch (err: any) {
    console.error("[cron] refresh exception:", err?.message);
    return new Response(err?.message ?? "fetch failed", { status: 500 });
  }
};

export const config: Config = {
  // Daily at 02:00 UTC (07:30 IST). Standard cron expression.
  schedule: "0 2 * * *",
};
