import type { Config } from "@netlify/functions";

// Netlify Scheduled Function: pings the K-Partnership commission
// auto-approval route once a day at 03:00 UTC (08:30 IST). The route
// flips `order_attributions` rows from 'pending' to 'approved' once
// `store_settings.commission_auto_approve_days` have passed since
// `orders.paid_at`.
//
// No-op when the admin keeps auto-approve at 0 — the route returns
// early in that case (verify already approved on payment).
//
// Auth: bearer `CRON_SECRET` — same env var the currency refresh uses.

const SITE_URL =
  process.env.SITE_URL ||
  process.env.URL ||
  "https://madenkorea.com";

export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET not set; skipping commission approval");
    return new Response("CRON_SECRET missing", { status: 500 });
  }

  const url = `${SITE_URL.replace(/\/$/, "")}/api/cron/commission-approve`;

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
      console.error(`[cron] commission-approve failed ${res.status}:`, body);
      return new Response(body, { status: res.status });
    }
    console.log(`[cron] commission-approve ok:`, body);
    return new Response(body, { status: 200 });
  } catch (err: any) {
    console.error("[cron] commission-approve exception:", err?.message);
    return new Response(err?.message ?? "fetch failed", { status: 500 });
  }
};

export const config: Config = {
  // Daily at 03:00 UTC (08:30 IST). Offset by an hour from the
  // currency-refresh cron so the two don't fire simultaneously.
  schedule: "0 3 * * *",
};
