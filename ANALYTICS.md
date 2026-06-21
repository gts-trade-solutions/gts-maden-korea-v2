# Analytics & Conversion Funnel

Last updated: 2026-04-30

This doc covers the first-party analytics layer that powers `/admin/analytics/funnel` and `/admin/analytics/sessions`. It's a self-hosted event log on Supabase — not Google Analytics, not PostHog. The legacy `gtag` snippet in `app/layout.tsx` is unrelated and stays for marketing-team use.

## What we capture

Whitelist lives in [lib/analytics/events.ts](lib/analytics/events.ts). The track route drops anything not on this list, so a compromised browser cannot inject arbitrary event names.

| Event | Fired from | When | Props |
|---|---|---|---|
| `page_view` | [components/AnalyticsBootstrap.tsx](components/AnalyticsBootstrap.tsx) | Every route change | `title` |
| `product_view` | [app/products/[slug]/product.tsx](app/products/[slug]/product.tsx) | After product fetch resolves | `product_id`, `slug`, `name`, `price`, `sale_price`, `brand` |
| `add_to_cart` | [lib/contexts/CartContext.tsx](lib/contexts/CartContext.tsx) → `addItem` | After Supabase write succeeds | `product_id`, `qty` |
| `remove_from_cart` | [lib/contexts/CartContext.tsx](lib/contexts/CartContext.tsx) → `removeItem` | After Supabase delete succeeds | `product_id` |
| `checkout_started` | [app/checkout/checkout.tsx](app/checkout/checkout.tsx) | First mount of checkout when cart has items (deduped via ref) | `item_count` |
| `pay_clicked` | [app/checkout/checkout.tsx](app/checkout/checkout.tsx) `handlePayment` | User submits, after totals are ready | `subtotal`, `shipping_fee`, `discount_total`, `total`, `item_count`, `promo_code` |
| `payment_modal_opened` | [lib/hooks/useRazorpayCheckout.ts](lib/hooks/useRazorpayCheckout.ts) | Right before `rzp.open()` | `order_id`, `razorpay_order_id`, `amount` |
| `payment_succeeded` | [lib/hooks/useRazorpayCheckout.ts](lib/hooks/useRazorpayCheckout.ts) | Inside Razorpay `handler` callback (immediately when modal closes after success) | `order_id`, `razorpay_order_id`, `razorpay_payment_id`, `amount` |
| `payment_failed` | [lib/hooks/useRazorpayCheckout.ts](lib/hooks/useRazorpayCheckout.ts) | Razorpay `payment.failed` event | `order_id`, `razorpay_order_id`, `reason`, `description`, `step`, `source` |
| `payment_cancelled` | [lib/hooks/useRazorpayCheckout.ts](lib/hooks/useRazorpayCheckout.ts) | Razorpay `modal.ondismiss` | `order_id`, `razorpay_order_id` |
| `order_placed` | **Server**: [app/api/razorpay/verify/route.ts](app/api/razorpay/verify/route.ts) | After payment is verified and the orders row is marked paid | `order_id`, `order_number`, `subtotal`, `shipping_fee`, `discount_total`, `total`, `provider_payment_id`, `provider_order_id` |

| `signup` | Server: [app/api/events/identify/route.ts](app/api/events/identify/route.ts) | Client (signup form) POSTs after `supabase.auth.signUp` succeeds | `backfilled_rows` |
| `login` | Server: [app/api/events/identify/route.ts](app/api/events/identify/route.ts) | Client (login form / OAuth callback) POSTs after auth succeeds | `backfilled_rows` |
| `logout` | Client: [lib/contexts/AuthContext.tsx](lib/contexts/AuthContext.tsx) → `logout()` | Fired before `supabase.auth.signOut()` so the row still has the user_id | none |

**Reserved but not yet wired** (whitelisted so the API accepts them, but no caller exists today): `pincode_checked`, `pincode_blocked`, `promo_applied`.

## Identity stitching across signup / login

When a visitor browses anonymously and later creates an account or logs in, the same `mik_anon_id` cookie persists. Pre-auth events have `user_id = null`; the auth flow then does **two things** via `POST /api/events/identify`:

1. **Backfill**: every prior event with `anon_id = X AND user_id IS NULL AND occurred_at > now() - interval '30 days'` is updated to `user_id = newly-authed user`. Past activity is now correctly attributed.
2. **Marker event**: a `signup` or `login` row is inserted under the same browser cookies, so the funnel can show signup placement.

The window is bounded to **30 days** so the UPDATE is cheap on a busy table and so events from a long-disused browser cookie don't get misattributed to a new account.

The route honors `profiles.tracking_consent = false` (skips both backfill and marker). It is admin-bypass internally because it must update other rows the user can't see directly.

After this fix, the recommended cohort/user query is simple:

```sql
-- Everything user X has ever done, including pre-signup
select * from events where user_id = '<USER_X>' order by occurred_at;
```

No `coalesce(user_id, anon_id)` trickery needed.

`logout` is a separate client-side event fired before `supabase.auth.signOut()` so the row still has the user_id attribution. The `mik_anon_id` cookie is **not** rotated on logout — same browser stays the same person, which is standard analytics behavior. A subsequent login from the same browser will stitch correctly even after logout.

## Why `order_placed` is server-side

Every other event is emitted by the browser via `trackEvent()` in [lib/analytics/track.ts](lib/analytics/track.ts). `order_placed` is the only event written directly from the server, inside `/api/razorpay/verify` after the payment is captured. This is deliberate: if a customer closes the tab during the 1–5 s verify wait, a client-side purchase event would be lost. The server-side write guarantees conversions are never undercounted, regardless of what the client did.

`payment_succeeded` (client) and `order_placed` (server) often both land — they are not duplicates. `payment_succeeded` measures "user saw the success modal close"; `order_placed` measures "we have a real paid order in the DB."

## Pipeline (what happens between `trackEvent()` and a DB row)

1. **Client emits** via `trackEvent(name, props, { immediate? })` in [lib/analytics/track.ts](lib/analytics/track.ts).
2. **Batched** in module memory for 1.5 s. Multiple events from the same page render coalesce into a single POST.
3. **Flushed on tab close** via `pagehide` / `visibilitychange` using `navigator.sendBeacon`. This is what saves `payment_cancelled` when the user X's the tab during checkout.
4. **POSTed to `/api/events/track`** ([app/api/events/track/route.ts](app/api/events/track/route.ts)) with `keepalive: true`. Up to 20 events per batch.
5. **Server enrichment** (everything below happens once per row):
   - `user_id` resolved from the authed Supabase session, or `null` for anons.
   - `anon_id` from the `mik_anon_id` cookie (1-year first-party). Created on first contact.
   - `session_id` from the `mik_session_id` cookie. Rotates after 30 min of inactivity (driven by the `mik_session_last` cookie).
   - `ip_prefix` derived from `x-forwarded-for` / `x-real-ip` and truncated to /24 (v4) or /48 (v6). **The full IP is never stored.**
   - `device` parsed from User-Agent into `{ type, os, browser }`.
   - `utm` collected from `?utm_source=…` / `utm_medium` / `utm_campaign` / `utm_term` / `utm_content` query params.
   - **PII strip**: `email`, `phone`, `password`, `address`, `address_line_1` removed from `props` before storage. JSON payload capped at 4 KB; over-cap props become `{ _truncated: true }`.
   - **Whitelist enforcement**: rows whose `event_name` is not in `KNOWN_EVENTS` are dropped silently.
6. **Consent gate**: if the user has `profiles.tracking_consent = false`, the row is silently skipped (returns `{ skipped: "consent" }`). Default is `true`. There is no opt-out toggle in the customer UI yet — it's a column you can flip per user via SQL or a future setting page.
7. **Insert** into `public.events` via the service-role admin client (RLS forbids client-direct inserts).

Failures at any step are best-effort — the route returns 200 with `written: 0` rather than 5xx, so an analytics outage cannot break the user path. Calls from the client are never `await`ed on critical flows.

## Identity model

Two IDs per event:

- **`anon_id`** — UUID in a first-party cookie `mik_anon_id`, 1-year expiry. Stable across sessions for the same browser. Set on the very first request.
- **`user_id`** — only present after Supabase auth login. Pre-login activity stays linked to the same `anon_id`, so you can stitch a session in queries with `coalesce(user_id::text, anon_id)`.

`session_id` is a separate UUID rotated after 30 min of inactivity. The funnel page groups events by `session_id` to compute "% of sessions reaching each stage."

## Schema

Migration: [supabase/migrations/20260430_events_funnel.sql](supabase/migrations/) (applied to live as `events_funnel`).

```
public.events
  id          uuid primary key
  occurred_at timestamptz default now()
  user_id     uuid references auth.users(id)         -- nullable for anons
  anon_id     text not null
  session_id  text not null
  event_name  text not null                          -- whitelisted (see KNOWN_EVENTS)
  path        text                                   -- e.g. '/products/anua-cleanser'
  referrer    text
  user_agent  text
  ip_prefix   text                                   -- /24 v4 or /48 v6
  utm         jsonb                                  -- { source, medium, campaign, term, content }
  device      jsonb                                  -- { type, os, browser }
  props       jsonb default '{}'::jsonb              -- PII-stripped event payload

indexes:
  events_occurred_at_idx           (occurred_at desc)
  events_user_time_idx             (user_id, occurred_at desc)
  events_anon_time_idx             (anon_id, occurred_at desc)
  events_name_time_idx             (event_name, occurred_at desc)
  events_session_idx               (session_id)
  events_props_product_idx         ((props->>'product_id')) where props ? 'product_id'

RLS:
  - Reads: admin only (`public.is_admin()`)
  - Writes: service-role only (browser cannot insert directly)
```

Plus `profiles.tracking_consent boolean default true` for opt-out.

## Admin UI

| Page | What it shows |
|---|---|
| [/admin/analytics/funnel](app/admin/analytics/funnel/page.tsx) | Per-stage session counts + % of top + drop-off %. Range toggle (24h / 7d / 30d / 90d). Drop-offs > 50% highlighted red. |
| [/admin/analytics/sessions](app/admin/analytics/sessions/page.tsx) | List of recent sessions sorted abandoned-first, with identity (name + email for logged-in users), highest stage reached, source (UTM/referrer), device, duration. |
| [/admin/analytics/sessions/[id]](app/admin/analytics/sessions/[id]/page.tsx) | Per-session timeline of every event with timestamps, deltas, expandable JSON props. Top card shows the visitor identity + device + source + IP prefix. |

All three are gated by `profiles.role === 'admin'` and wait for `AuthContext.ready` before checking — don't add new admin pages without that pattern or non-admins get redirected during a hydration race.

## Privacy / DPDP posture

- IPs are persisted only as /24 (v4) or /48 (v6) prefixes. Full IP is never stored.
- PII keys (`email`, `phone`, `password`, `address`, `address_line_1`) are stripped from `props` server-side, even if a caller accidentally passes them.
- Per-user opt-out via `profiles.tracking_consent`. Default true; honored by the track route.
- No third-party data sharing. The events table lives in your Supabase project, accessible only to admins.
- No retention job is configured today. **Recommended:** a daily `delete from public.events where occurred_at < now() - interval '180 days'` via Supabase pg_cron.

## Common queries

Funnel by session, last 7 days:

```sql
with funnel as (
  select session_id,
    max(case when event_name = 'product_view'         then 1 else 0 end) viewed_product,
    max(case when event_name = 'add_to_cart'          then 1 else 0 end) added_to_cart,
    max(case when event_name = 'checkout_started'     then 1 else 0 end) started_checkout,
    max(case when event_name = 'pay_clicked'          then 1 else 0 end) clicked_pay,
    max(case when event_name = 'payment_modal_opened' then 1 else 0 end) opened_modal,
    max(case when event_name = 'order_placed'         then 1 else 0 end) purchased
  from events
  where occurred_at > now() - interval '7 days'
  group by session_id
)
select count(*) total_sessions,
       sum(viewed_product),
       sum(added_to_cart),
       sum(started_checkout),
       sum(clicked_pay),
       sum(opened_modal),
       sum(purchased)
from funnel;
```

Products that get added to cart but rarely purchased:

```sql
select props->>'product_id' as product_id,
       count(*) filter (where event_name = 'add_to_cart')          as adds,
       count(*) filter (where event_name = 'order_placed' and props->>'product_id' is not null) as purchases
from events
where occurred_at > now() - interval '30 days'
  and props ? 'product_id'
group by 1
order by adds - purchases desc
limit 50;
```

Drop-off by traffic source:

```sql
select coalesce(utm->>'source', 'direct') as source,
       count(distinct session_id) filter (where event_name = 'page_view')         as visits,
       count(distinct session_id) filter (where event_name = 'order_placed')      as conversions
from events
where occurred_at > now() - interval '30 days'
group by 1
order by visits desc;
```

## Adding a new event

1. Append the name to `KNOWN_EVENTS` in [lib/analytics/events.ts](lib/analytics/events.ts).
2. From a client component: `import { trackEvent } from "@/lib/analytics/track";` then `trackEvent("your_event_name", { … })`.
3. From a server route: insert directly into `public.events` via the admin client (see the pattern in `/api/razorpay/verify`).
4. If it's a meaningful funnel stage, add it to `FUNNEL_STAGES` in `lib/analytics/events.ts` and to the SQL pivot in [/api/admin/analytics/funnel/route.ts](app/api/admin/analytics/funnel/route.ts) so it appears on the dashboard.

## Things this layer does NOT do

- No session replay (mouse/scroll recording). For that, layer in PostHog or LogRocket.
- No real-time stream (events are batched and inserted; the funnel/sessions UIs poll on load).
- No automatic cohort analysis (funnels by traffic source, returning vs new). The data supports it but there's no UI yet.
- No events on signup/login/logout/promo apply yet — see "Reserved but not yet wired" above.
