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
- MySQL 8 + Prisma 6 — the only datastore. NextAuth v4 (JWT credentials) for auth. AWS S3 + CloudFront for media.
  (Supabase was fully removed — see "Supabase is gone" below.)
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
- [lib/](lib/) — Prisma client ([lib/db/prisma.ts](lib/db/prisma.ts)), data readers ([lib/data/](lib/data/)), auth helpers, contexts (Auth/Cart/Wishlist), pricing, membership, storage (S3), DTDC, SES, social helpers.
- [utils/](utils/) — assorted shared utilities.
- [types/](types/) — shared TypeScript domain types.
- [public/](public/) — logos, static images, certifications, sample WhatsApp template JSON.

Path alias: `@/*` resolves to repo root (see [tsconfig.json](tsconfig.json)). shadcn aliases are in [components.json](components.json).

## Key Subsystems (one-line each — see CODEBASE_REFERENCE.md for full detail)

- **App shell** — [app/layout.tsx](app/layout.tsx) wraps with ThemeProvider, AuthProvider, CartProvider, WishlistProvider, Toaster, FloatingWhatsApp. Theme is forced light via `next-themes` with `storageKey="madenkorea-theme"`.
- **Auth** — NextAuth (JWT credentials) via [lib/auth/authOptions.ts](lib/auth/authOptions.ts); [lib/contexts/AuthContext.tsx](lib/contexts/AuthContext.tsx) wraps `useSession`. Users live in `auth_users` (Prisma model `User`) with the app profile in `profiles` sharing the same id. Role rides in the JWT; admin = `role in (admin, super_admin)`. Server-side: `getSessionUser()` ([lib/auth/session.ts](lib/auth/session.ts)), `getRouteAuth()` ([lib/auth/routeUser.ts](lib/auth/routeUser.ts)), `requireAdmin()` ([lib/auth/adminGuard.ts](lib/auth/adminGuard.ts)).
- **Middleware** — [middleware.ts](middleware.ts) only seeds the `mik_country` / `mik_currency` / `mik_locale` preference cookies. Auth is validated per-request by NextAuth + the route guards, so there is no session refresh here.
- **Cart** — [lib/contexts/CartContext.tsx](lib/contexts/CartContext.tsx). Guests use `localStorage["guest_cart_v1"]`; logged-in users hit `/api/cart/*`, which read/write MySQL via [lib/data/cart.ts](lib/data/cart.ts). Guest carts merge into the server cart on login.
- **Checkout** — [app/checkout/checkout.tsx](app/checkout/checkout.tsx) → [/api/checkout/calc-totals](app/api/checkout/calc-totals/) (server-authoritative pricing/promo/shipping) → [/api/razorpay/create](app/api/razorpay/create/) → [/api/razorpay/verify](app/api/razorpay/verify/) (signature check, mark paid, attribution, promo increment, cart clear, SES emails).
- **Shipping math** — [lib/membership.ts](lib/membership.ts). K Plus members → free shipping. Otherwise free above `DELIVERY_THRESHOLD = 2000`, else `149`.
- **Promo cap** — `calc-totals` enforces a global 25% cap across user discount + influencer commission unless overridden by `influence_caps`.
- **K Plus membership** — Plan code `k_plus`, ₹199, 90 days. APIs under `/api/membership/*`. Table: `user_memberships`.
- **Influencer/referral** — `/influencer/*` dashboard, `/r/[code]` and `/rl/[id]` redirects (referral clicks are logged in-app). Tables: `influencer_*`, `referral_*`, `promo_codes`, `influence_caps`, `order_attributions`.
- **DTDC shipping** — [lib/dtdc/](lib/dtdc/) wraps Shipsy create/cancel/label/track. Auto-create after payment is **commented out** in [app/api/razorpay/verify/route.ts](app/api/razorpay/verify/route.ts) — leave intentional.
- **Admin portal** — `/admin/*` (products, orders, vendors, CMS, influencers, analytics, invoices, email, whatsapp, marketing). CMS lives at `/admin/cms/*`.
- **Vendor portal** — moved out of this repo. It is a standalone app at vendor.madenkorea.com (repo `vendor-portal-v2-gts`) sharing the same MySQL database. The old `app/vendor/*` tree was deleted; `/vendor` 404s here.

## Supabase is gone (migration complete)

The app ran on Supabase (Auth + Postgres + Storage) until it was migrated to
MySQL/Prisma + NextAuth + S3. **There is no Supabase code, client, or npm
dependency left** — do not reintroduce one.

| Concern | Use |
|---|---|
| Any DB read/write | `import { prisma } from "@/lib/db/prisma"` (shared singleton) |
| Reusable queries | [lib/data/](lib/data/) — catalog, cart, checkout, orders, influencer, home, meta |
| Current user (route/RSC) | `getSessionUser()` / `getRouteAuth()` |
| Admin gate | `requireAdmin()` — 401/403 response, role from the JWT |
| Media URLs | `resolveMediaUrl(bucket, path)` ([lib/storage/backend.ts](lib/storage/backend.ts)) — S3/CloudFront only |
| Uploads | `/api/uploads/presign` (S3 presigned PUT) |

Notes for future work:
- Prisma applies no `dbgenerated()` defaults, so `Char(36)` ids need
  `randomUUID()` and NOT-NULL Json columns must be written explicitly (`{}` / `[]`).
- Prisma has no `upsertMany`; batch upserts are a `$transaction` of per-row
  upserts keyed on the composite unique (see [lib/data/meta.ts](lib/data/meta.ts)).
- Postgres RLS is gone. Ownership must be enforced explicitly in the `where`
  clause — an `updateMany`/`deleteMany` matching 0 rows should return 404.
- Some `*_url` columns still hold legacy Supabase Storage URLs. `supabaseUrlToCdn()`
  rewrites them to CloudFront (the S3 object lives at the same `<bucket>/<key>`),
  which is why the `/storage/v1/...` marker strings still exist.

## Database Schema

[prisma/schema.prisma](prisma/schema.prisma) is the source of truth, introspected
from the live MySQL database. Run `npx prisma generate` after pulling schema
changes. The migration record (ETL scripts, plans, runbooks) is kept under
[migration/](migration/) for history.

## Known Gotchas

- **Two product detail routes exist**: [app/products/[slug]/](app/products/) (active) and [app/product/[slug]/](app/product/) (legacy redirect). Always link to `/products/[slug]`.
- **Some admin email files are `.txt`**, not `.tsx` — they are archived, not active App Router pages. Don't try to "fix" them by importing them.
- **Mock data layer is legacy.** `lib/mock-data/`, `MockAuthApi`, `MockProductApi`, `AuthAdapter`, `ProductAdapter` are dead-code candidates (see CODEBASE_REFERENCE dead-code queue). Real data flows through MySQL/Prisma. Don't extend the mock layer.
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

Full categorized list (MySQL, NextAuth, S3/CloudFront, Razorpay, SES, DTDC, Meta/Instagram/Facebook, WhatsApp, OpenAI, referral) is in CODEBASE_REFERENCE.md → "Environment Variables Referenced". **Never read or paste `.env` values into docs, commits, or tool output.**

Storage buckets used: `product-media`, `review-media`, `site-assets`.

## Conventions

- Path alias `@/*` → repo root.
- Import the shared Prisma singleton (`import { prisma } from "@/lib/db/prisma"`); never construct a second PrismaClient (it doubles the connection pool).
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
