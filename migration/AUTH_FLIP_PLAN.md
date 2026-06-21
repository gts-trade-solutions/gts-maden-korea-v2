# Auth-Session Flip Plan — Supabase Auth → NextAuth

Status: **Steps A–D CODE-COMPLETE & gated; only Step E (flip + test) remains.** Last updated 2026-06-20.
Scope: **storefront + account + checkout + influencer + ADMIN**. **Vendor portal EXCLUDED** (separate app — its own auth migration; leave `/vendor/*` on Supabase auth for now).

> **Executable Step-E runbook: [STEP_E_RUNBOOK.md](STEP_E_RUNBOOK.md)** — exact flags, click-path matrix, log signals, rollback. Read that to perform the cutover. The sections below are the design/rationale.

---

## 0. Verified precondition (the thing the whole flip rests on)
`NextAuth user.id` **===** the Supabase user id used by every data table.
- `auth_users.id` == `profiles.id` for **53/53** users.
- Spot check: arunpandian `05eb983e-…` identical in `auth_users`, `profiles`, and `orders.user_id`.
- ⇒ `getCurrentUserId()` returns the same id under either backend → cart/orders/influencer keep resolving. ✅

If a future user is created only in Supabase (not NextAuth) or vice-versa, this breaks — registration must write BOTH (see Step C2).

---

## 1. Current auth wiring (as-is)
- **Seam (good):** `lib/auth/identity.ts` `getCurrentUserId()` is flag-aware (`AUTH_BACKEND=nextauth`). Only a FEW routes use it (cart, orders/create).
- **Everything else (the work):** **324 inline auth calls across 98 route files** resolve the user via Supabase in 3 patterns:
  1. `supabaseRouteClient().auth.getUser()`
  2. `createServerClient(...)` + cookie store
  3. Bearer token: `createClient(..., { global: { headers: { Authorization } } })` + `auth.getUser(token)` — the `/api/me/*` + influencer routes accept `Authorization: Bearer <supabase access_token>`.
- **Client:** `AuthContext` holds a Supabase session. `/api/auth/attach` bridges the Supabase `access_token`/`refresh_token` into `sb-*` cookies so server routes see the session.
- **Middleware:** `createMiddlewareClient` refreshes Supabase cookies on `/account`, `/admin`, `/checkout`, `/vendor`, `/auth/callback`.
- **Admin gating:** `profiles.role === "admin"` (client `AuthContext` + inline server checks).
- **NextAuth (already built, unused in prod path):** `authOptions` (Credentials bcrypt + Google + Facebook, **JWT** strategy, PrismaAdapter on `auth_*` tables), `lib/auth/session.ts` (`getSessionUser`/`getSessionUserId`). JWT currently carries only `uid`.

---

## 2. Target state
- Every server route resolves identity through **one** backend-aware helper → Supabase now, NextAuth at flip.
- Client uses **NextAuth** (`useSession`/`signIn`/`signOut`). No Supabase session, no Bearer bridge.
- Middleware enforces the **NextAuth** session on protected paths (except `/vendor`).
- Admin **role carried in the NextAuth JWT** (read from MySQL `profiles.role` at sign-in), gating client + server.

---

## 3. Strategy — strangler, reversible via `AUTH_BACKEND`
Each step is shippable with the flag still on `supabase` (identical behavior) EXCEPT Step E.

### Step A — Unify the server seam (the bulk; zero behavior change)
- **A1.** Build `getRouteUser(req)` (one helper): backend-aware, handles cookie **and** Bearer. Supabase path = today's exact logic; NextAuth path = `getServerSession(authOptions)`. Returns `{ id, email, role }`.
- **A2.** Mechanically replace the inline `withUser`/`auth.getUser()`/Bearer patterns across the **98 route files (vendor excluded)** with `getRouteUser`. Each edit is local + behavior-identical while flag=`supabase`.
  - Batch by area, smoke after each (flag still supabase → must behave identically):
    1. account/cart/checkout/orders/reviews/membership
    2. me/* + influencer/*
    3. admin/* (the admin focus)
    4. instagram/* + misc (events, currency, user/preferences)
  - **Leave `/api/vendor/*` and vendor routes untouched.**
- Net: all auth resolution funnels through one resolver. Fully reversible (flag unchanged).

### Step B — Carry role in the NextAuth JWT
- **B1.** `authOptions.jwt`: on sign-in, read `profiles.role` (MySQL) into `token.role`; `session` callback exposes `session.user.role`.
- **B2.** `getRouteUser` returns `role` (from NextAuth token when flipped, else `profiles` lookup).

### Step C — Client flip
- **C1.** `AuthContext` sources identity from `useSession()` (NextAuth) when the client flag is set, else Supabase — **keep the same context shape** so consumers (`isAdmin`, `user`, etc.) don't change.
- **C2.** Login/register → NextAuth: `signIn("credentials"|"google"|"facebook")`; register route creates BOTH the `auth_users` row (hashed password) **and** the `profiles` row with the **same id** (preserve the invariant in §0).
- **C3.** Drop the `/api/auth/attach` Bearer bridge; client `fetch`es rely on NextAuth cookies (`credentials: "include"`). Remove `Authorization: Bearer` sends from the influencer/me/* client calls.

### Step D — Middleware flip
- **D1.** On `/account`, `/admin`, `/checkout` (NOT `/vendor`), validate the NextAuth JWT via `getToken` instead of Supabase `getSession`; redirect unauthenticated → `/auth/login`.
- **D2.** Keep the existing Supabase refresh **for `/vendor` only** (separate app).

### Step E — Cutover
- **E1.** Set `AUTH_BACKEND=nextauth` (+ a `NEXT_PUBLIC_AUTH_BACKEND` mirror for the client). Seam, `getRouteUser`, client, middleware all switch together.
- **E2.** Run the full test matrix (§5).
- **E3.** Rollback = unset the flag → everything reverts to Supabase (Steps A–D keep the Supabase path intact).

---

## 4. Admin specifics (the focus)
- Admin login uses the same NextAuth credentials/OAuth; gate by `token.role === "admin"`.
- `/admin/*` routes: replace inline Supabase role checks with `getRouteUser` → require `role === "admin"`.
- `AuthContext.isAdmin` reads the NextAuth session role.
- NOTE: admin **data writes** (approve influencer, process payout, settings) flipping to MySQL is the **admin-portal data migration** (separate workstream); this plan only flips **auth resolution** for admin routes.

---

## 5. Test matrix (after E1)
- Credentials login (existing migrated user, **no reset**) → session OK.
- Google + Facebook login → links to existing `auth_users` (allowDangerousEmailAccountLinking).
- Register new user → `auth_users` + `profiles` created with same id → login.
- Browse → cart add/merge → **checkout + pay** (id must match so cart/orders resolve) → order shows in `/account/orders`.
- Influencer dashboard (summary/promos/payouts) loads under NextAuth identity.
- **Admin:** login → `/admin` gated, pages load, non-admin blocked.
- Logout clears session; protected routes redirect to `/auth/login`.
- **Rollback test:** unset flag → Supabase login still works.

---

## 6. Risks & gotchas
- **ID mismatch** (NextAuth id ≠ data id) → cart/orders/influencer break. Verified today (§0); re-verify after any new registrations.
- **98-file conversion** could miss a route or subtly change behavior → batch + smoke with flag=supabase (identical behavior) before flipping.
- **Bearer callers:** client currently sends the Supabase access_token as Bearer to `/api/me/*`. After C3 those must stop; `getRouteUser` NextAuth path reads the session cookie (ensure `credentials:"include"`).
- **OAuth env:** Google/Facebook providers self-disable unless their client id/secret are set in the deploy env.
- **`requireEmailVerified`** (used by razorpay/create, payouts, influencer/request) reads Supabase today → must read NextAuth/MySQL (`auth_users.email_verified` / `profiles`).
- **Password reset / email change** flows are Supabase-auth today → need NextAuth equivalents (or interim: keep minimal, since existing users keep their bcrypt hash).
- **`auth_users` columns are snake_case** (`password_hash`, `email_verified`); the Prisma `User` model maps them. authOptions already uses the Prisma field names.

---

## 7. Explicitly EXCLUDED (per direction)
Vendor portal — `/vendor/*`, `components/vendor/VendorGate`, `get_my_vendor` RPC, `/api/vendor/*`. It is a separate app and migrates its own auth on its own track. Middleware keeps the Supabase refresh for `/vendor` only.

---

## 8. Recommended sequencing
**A first, fully** (the bulk, fully reversible, de-risks everything) → **B, C, D** (small, targeted) → **E** (flip + test). Only E is irreversible-ish, and even E rolls back via the flag.
