# CLAUDE.md

Orientation for Claude Code working in this repository. Keep this file lean: deep details live in the companion docs listed below — read them before doing non-trivial work.

## Companion Docs (read these for depth)

- [CODEBASE_REFERENCE.md](CODEBASE_REFERENCE.md) — authoritative map of the live code: routes, APIs, RPCs, tables, env vars, dead-code queue. Last verified 2026-04-24.
- [ISSUE_REGISTER.md](ISSUE_REGISTER.md) — enriched issue register (audit findings, fix status, confidence markers). Treat as a planning doc; re-verify items marked `[INFERRED]` or `[UNVERIFIED]` before acting.
- [REQUIREMENTS.md](REQUIREMENTS.md) — original product requirements. Some sections are dated; trust CODEBASE_REFERENCE over REQUIREMENTS when they conflict.
- [ANALYTICS.md](ANALYTICS.md) — first-party event log + conversion funnel (admin pages at `/admin/analytics/funnel` and `/admin/analytics/sessions`). Lists every captured event, where it fires from, the props payload, and the privacy/PII posture. Read before adding new events.
- [SEO.md](SEO.md) — SEO audit + action plan (internal gaps, external off-site actions, sequencing). Living document; update checkboxes as items ship. Last audit: 2026-05-08.
- [MULTILANGUAGE.md](MULTILANGUAGE.md) — Phase 2 (multi-language) reference: i18n architecture, static + dynamic translation pipelines, admin layer, operational guide, loose ends, next phases. Last updated 2026-05-14.
- [INTERNATIONAL_PAYMENTS.md](INTERNATIONAL_PAYMENTS.md) — Razorpay international checkout build spec: confirmed inputs, currency exponent reference, build plan, deferred items. Status: spec locked, code not started. Last updated 2026-05-16.
- [COUNTRY_PRICING.md](COUNTRY_PRICING.md) — per-country offer pricing (Phase 1 live, Phase 2 cleanup + Phase 3 extensions planned). Architecture map, files touched, debt being carried, full Phase 2 migration SQL + risk register. Read before touching anything in `lib/pricing.ts`, `product_country_prices`, or the resolver call sites. Last updated 2026-05-21.
- [COUNTRY_LANGUAGE_REGISTRY.md](COUNTRY_LANGUAGE_REGISTRY.md) — admin-managed country/language/currency catalog spec (the planned `/admin/countries` portal). Three new tables, reader-layer refactor across `lib/countries.ts` / `lib/locales.ts` / `lib/currency.ts`, edge-case matrix, open questions. Status: spec locked, code not started. Last updated 2026-05-29.
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) — historical milestone log (2025-10). Mostly historical; do not assume it reflects current state.

When you fix an issue, update both the issue register status and any relevant notes in CODEBASE_REFERENCE.md.

## What This App Is

MadeNKorea is a Next.js 14 App Router e-commerce platform for Korean beauty/lifestyle products. It bundles a customer storefront, account area, cart + Razorpay checkout, an admin portal, a vendor portal, an influencer/referral system, K Plus paid membership, invoicing, email (SES) and WhatsApp campaigns, and Meta/Facebook/Instagram marketing tools.

Reference site: https://www.madenkorea.com/

## Tech Stack (verify against [package.json](package.json) before assuming versions)

- Next.js 14.2.35 App Router (`/app` directory) · React 18.2 · TypeScript 5.2
- Tailwind CSS 3.3 + shadcn/Radix UI · `lucide-react` icons
- Supabase (Auth, Postgres, Storage, Edge Functions, RPCs) — primary backend
- Razorpay (payments) · DTDC/Shipsy (shipping) · AWS SES (email) · OpenAI (social copy)
- Meta Graph API · Instagram Graph · Facebook Graph · WhatsApp Cloud API
- Recharts · Embla · Swiper

## Commands

| Task | Command |
|---|---|
| Install | `npm install` |
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |

Note: [next.config.js](next.config.js) sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`. **`npm run build` will succeed even with type or lint errors** — always run `npm run typecheck` and `npm run lint` separately when validating changes.

## Top-Level Layout

- [app/](app/) — pages, layouts, route handlers, server actions (App Router).
- [components/](components/) — shared UI, customer shell, product cards, home modules, [admin/](components/admin/) and [vendor/](components/vendor/) forms, [ui/](components/ui/) shadcn primitives.
- [lib/](lib/) — Supabase clients, contexts (Auth/Cart/Wishlist), pricing, membership, storage, DTDC, SES, social helpers.
- [utils/](utils/) — additional Supabase SSR helpers and vendor utilities.
- [types/](types/) — shared TypeScript domain types.
- [supabase/migrations/](supabase/migrations/) — local migrations (only a subset of the production schema; see caveat below).
- [supabase/functions/](supabase/functions/) — deployed edge functions (referral clicks, Meta IG callback, SES webhook).
- [public/](public/) — logos, static images, certifications, sample WhatsApp template JSON.

Path alias: `@/*` resolves to repo root (see [tsconfig.json](tsconfig.json)). shadcn aliases are in [components.json](components.json).

## Key Subsystems (one-line each — see CODEBASE_REFERENCE.md for full detail)

- **App shell** — [app/layout.tsx](app/layout.tsx) wraps with ThemeProvider, AuthProvider, CartProvider, WishlistProvider, Toaster, FloatingWhatsApp. Theme is forced light via `next-themes` with `storageKey="madenkorea-theme"`.
- **Auth** — [lib/contexts/AuthContext.tsx](lib/contexts/AuthContext.tsx) backed by Supabase Auth + `profiles` table. Admin = `profiles.role === "admin"`. Vendors gated separately via [components/vendor/VendorGate.tsx](components/vendor/VendorGate.tsx) using RPC `get_my_vendor`.
- **Middleware** — [middleware.ts](middleware.ts) refreshes Supabase auth cookies only for `/account`, `/admin`, `/checkout`, `/vendor` (not login/register), and `/auth/callback`.
- **Cart** — [lib/contexts/CartContext.tsx](lib/contexts/CartContext.tsx). Guests use `localStorage["guest_cart_v1"]`; logged-in users hit Supabase RPCs via [lib/cartClient.ts](lib/cartClient.ts). Guest carts merge into server carts on login (`merge_cart` RPC).
- **Checkout** — [app/checkout/checkout.tsx](app/checkout/checkout.tsx) → [/api/checkout/calc-totals](app/api/checkout/calc-totals/) (server-authoritative pricing/promo/shipping) → [/api/razorpay/create](app/api/razorpay/create/) → [/api/razorpay/verify](app/api/razorpay/verify/) (signature check, mark paid, attribution, promo increment, cart clear, SES emails).
- **Shipping math** — [lib/membership.ts](lib/membership.ts). K Plus members → free shipping. Otherwise free above `DELIVERY_THRESHOLD = 2000`, else `149`.
- **Promo cap** — `calc-totals` enforces a global 25% cap across user discount + influencer commission unless overridden by `influence_caps`.
- **K Plus membership** — Plan code `k_plus`, ₹199, 90 days. APIs under `/api/membership/*`. Table: `user_memberships`.
- **Influencer/referral** — `/influencer/*` dashboard, `/r/[code]` and `/rl/[id]` redirects, edge function [supabase/functions/log-referral-click](supabase/functions/log-referral-click/). Tables: `influencer_*`, `referral_*`, `promo_codes`, `influence_caps`, `order_attributions`.
- **DTDC shipping** — [lib/dtdc/](lib/dtdc/) wraps Shipsy create/cancel/label/track. Auto-create after payment is **commented out** in [app/api/razorpay/verify/route.ts](app/api/razorpay/verify/route.ts) — leave intentional.
- **Admin portal** — `/admin/*` (products, orders, vendors, CMS, influencers, analytics, invoices, email, whatsapp, marketing). CMS lives at `/admin/cms/*`.
- **Vendor portal** — `/vendor/*`. Public: `/vendor/login`, `/vendor/register`. Everything else is gated by `VendorGate`.

## Supabase Client Selection (important)

There are several helpers — pick the one that matches the execution context:

| Context | Use |
|---|---|
| Browser/client component | [lib/supabaseClient.ts](lib/supabaseClient.ts) (anon key singleton) |
| Server component (RSC) | [lib/supabase-rsc.ts](lib/supabase-rsc.ts) |
| Route handler | [lib/supabaseRoute.ts](lib/supabaseRoute.ts) |
| Server-side admin / service role | [lib/supabaseAdmin.ts](lib/supabaseAdmin.ts) |
| Auth/email server flows | [lib/supabaseServer.ts](lib/supabaseServer.ts) |

Plus [utils/supabase/](utils/supabase/) (`client.ts`, `server.ts`, `browser.ts`, `middleware.ts`) for SSR helpers.

**Never import `lib/supabaseAdmin.ts` (or any service-role client) from a client component.** Service-role keys must stay server-only.

Some client components instantiate Supabase directly with env vars instead of importing the shared helper. Functional but inconsistent — prefer the helper when adding new code.

## Database Schema Caveat

[supabase/migrations/](supabase/migrations/) contains only three local migrations. The production Supabase project has **far more** schema than this repo represents. Treat the table list in CODEBASE_REFERENCE.md as the authoritative inventory of what the code touches, and verify column shapes via Supabase Studio or live queries before assuming.

Local migrations present:
- `20260421_create_password_reset_tokens.sql`
- `20260422_create_contact_messages.sql`
- `20260422_enforce_promo_max_uses.sql`

## Known Gotchas

- **Two product detail routes exist**: [app/products/[slug]/](app/products/) (active) and [app/product/[slug]/](app/product/) (legacy redirect). Always link to `/products/[slug]`.
- **Some admin email files are `.txt`**, not `.tsx` — they are archived, not active App Router pages. Don't try to "fix" them by importing them.
- **Mock data layer is legacy.** `lib/mock-data/`, `MockAuthApi`, `MockProductApi`, `AuthAdapter`, `ProductAdapter` are dead-code candidates (see CODEBASE_REFERENCE dead-code queue). Real data flows through Supabase. Don't extend the mock layer.
- **Razorpay verify route is the heaviest critical path** — [app/api/razorpay/verify/route.ts](app/api/razorpay/verify/route.ts) combines signature verification, payment metadata, attribution, promo increment, cart clear, and inline-HTML SES emails. Edit carefully and test the full payment flow.
- ~~**Two ProductForm backups exist** (`ProductForm v-1.tsx`, `ProductForm v-2.tsx`) — they are stale and currently contribute typecheck errors. Not imported anywhere; deletion candidates.~~ Both deleted 2026-05-08 (SEO P2 #12 cleanup).
- **`lib/adminAuth.ts`** checks an `ADMIN_EMAIL` request header but the visible admin UI relies on `AuthContext` role checks — don't mix the two.
- **Build ignores type errors** (see Commands above). Run `npm run typecheck` explicitly.

## Mobile-View Conventions

Tailwind defaults are `sm: 640px`, `md: 768px`, `lg: 1024px`. To prevent the tablet dead-zone (640–1023px), use these canonical class strings instead of inventing your own:

| Use case | Class string |
|---|---|
| Product / card grid (4-up at desktop) | `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4` |
| Card grid (3-up at desktop) | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6` |
| Form row (3-field row) | `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4` |
| Footer columns (5-up) | `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6` |
| Sticky desktop sidebar (cart summary, etc.) | `lg:sticky lg:top-20` — never plain `sticky top-20`, which jumps on mobile |
| Floating fixed button (FloatingWhatsApp) | `z-40` — keep below shadcn Dialog/Sheet (`z-50`) |

For `<Image>` in a 2-column mobile grid (most product cards), `sizes` must reflect the actual rendered width: `"(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"` — never `100vw` on mobile, that loads 2× the bandwidth needed.

## Environment Variables

Full categorized list (Supabase, Razorpay, SES, DTDC, Meta/Instagram/Facebook, WhatsApp, OpenAI, referral) is in CODEBASE_REFERENCE.md → "Environment Variables Referenced". **Never read or paste `.env` values into docs, commits, or tool output.**

Storage buckets used: `product-media`, `review-media`, `site-assets`.

## Conventions

- Path alias `@/*` → repo root.
- Use existing Supabase client helpers; don't construct ad-hoc clients in new code.
- Prefer route handlers under `app/api/*` for server-authoritative logic (pricing, payment verification, etc.). Keep client components thin.
- shadcn/Radix UI is the design system. Reuse `components/ui/*` rather than introducing new primitives.
- The `components/admin/` and `components/vendor/` trees mirror their portal route trees — keep that mapping.

## Working Pointers (where to look first)

- Touching checkout? → [app/checkout/checkout.tsx](app/checkout/checkout.tsx), [lib/hooks/useRazorpayCheckout.ts](lib/hooks/), `/api/checkout/calc-totals`, `/api/razorpay/create`, `/api/razorpay/verify` together.
- Touching promo/referral? → [lib/promo-cookie.ts](lib/promo-cookie.ts), `/api/promo/*`, `/api/checkout/calc-totals`, `/r/[code]`, `/rl/[id]`, influencer APIs.
- Touching auth? → AuthContext, [middleware.ts](middleware.ts), `/auth/*`, `/api/auth/*`, `profiles` table, and `VendorGate` for vendor flows.
- Touching admin products? → [app/admin/products/](app/admin/products/), [components/admin/ProductForm.tsx](components/admin/), `ProductEditor.tsx`, `product_images` table.
- Touching social/marketing? → `/admin/marketing/*`, `/admin/instagram/*`, `/api/instagram/*`, `/api/facebook/*`, `/api/social/*`, `/api/ai/social-copy`, `/api/ai/facebook-copy`.

## Updating This File

Keep CLAUDE.md as a fast index, not an encyclopedia. When adding details, prefer expanding CODEBASE_REFERENCE.md and linking from here. Update the "Last verified" date in CODEBASE_REFERENCE.md whenever you do a fresh sweep of the code.
