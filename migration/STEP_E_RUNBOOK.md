# Step E — Auth Cutover Runbook (Supabase Auth → NextAuth)

Executable checklist for flipping the storefront/account/checkout/influencer/admin auth from
Supabase to NextAuth. Steps A–D are code-complete and gated; this flip is a **config change**,
fully reversible by unsetting two env vars. **Vendor portal stays on Supabase — do not touch `/vendor/*`.**

Last updated 2026-06-20.

---

## 0. Pre-flight

### Already PROVEN (2026-06-20) ✅ — no need to re-run
- **Register dual-write** (`migration/etl/verify-register.mjs <email>`): real browser signup
  `thakur33233@gmail.com` landed in ALL 4 stores with one id `f4394d62…`, role customer, bcrypt hash
  present, Supabase confirmed. The §0 invariant holds for new users.
- **Duplicate guard:** registering an existing email (the admin `arunpandian972000@…`) returns
  `409 EMAIL_EXISTS` before any write — existing account untouched.
- **NextAuth credentials login + role-in-JWT** (`migration/etl/test-nextauth-login.mjs`): register →
  csrf → credentials callback → `/api/auth/session` returned `{ user.id, user.role }`. NextAuth
  authenticates the bcrypt hash and stamps the role. Self-cleaning. (Confirms admin gating will work.)

### Still to check before flipping
1. **Single dev server only.** Two servers sharing `.next` corrupts the webpack chunks. Kill every
   `next` process, clear `.next`, start ONE:
   ```bash
   rm -rf .next && npx next dev -p 3001
   ```
2. **⚠️ `NEXTAUTH_URL` must match the running port.** It is currently `http://localhost:3000` but the
   dev server runs on **:3001**. Credentials login tolerates the mismatch (cookies are port-agnostic),
   but **OAuth will redirect to :3000 and fail.** Before testing OAuth, either run the server on 3000,
   or set `NEXTAUTH_URL=http://localhost:3001`. Also add `http://<host>/api/auth/callback/google`
   (and `/facebook`) to the Google/Facebook consoles — NextAuth's callback, NOT Supabase `/auth/callback`.
   (`NEXTAUTH_SECRET`, `DATABASE_URL`, `GOOGLE_*`, `FACEBOOK_*` are all already SET.)
3. **✅ Checkout `auth.uid()` bridge — RESOLVED, no secret needed.** The cart RPCs (`ensure_cart`,
   `add_to_cart`, `update_cart_item`, `remove_cart_item`, `merge_cart`) and **`create_order_from_cart`**
   derive the user from `auth.uid()`, NULL under NextAuth. Fixed with **service-role-only `*_as(p_user_id,…)`
   wrapper RPCs** (migration `nextauth_cart_order_as_user_wrappers`, **applied**) that set the user GUC then
   delegate to the originals; `supabaseForUser(userId)` returns the service-role client under NextAuth and
   `rpcForUser()` routes to the wrappers. **All 11 affected routes converted** (cart×2, orders/create,
   reviews×3, account×5) + every query audited for explicit `user_id` scoping (service-role bypasses RLS).
   PROVEN at the DB level — `node migration/etl/test-as-wrappers.mjs` (ensure→add→order, all AS the user).
   **No `SUPABASE_JWT_SECRET` required.** Vendor app + the Supabase-backend path are untouched.
4. **Typecheck clean:** `npm run typecheck` (build ignores TS errors — run it explicitly).
5. **Know your rollback** (§4). Two lines + a restart. (DB rollback if ever needed: `drop function` the six
   `*_as` wrappers — they're additive and unused by the Supabase path.)

---

## 1. The flip

Add to `.env.local` (both — server seam AND client read the flag):
```
AUTH_BACKEND=nextauth
NEXT_PUBLIC_AUTH_BACKEND=nextauth
```
Restart the single dev server (Pre-flight #1). `NEXT_PUBLIC_*` is inlined at build, so a restart is
mandatory — a hot reload won't pick it up.

What switches together: `getRouteUser`/`requireAdmin` (server seam) → NextAuth JWT · `AuthContext`
+ login/register pages → `useSession`/`signIn` · client components → `clientAuth` sentinel/cookie ·
middleware → skips Supabase refresh except `/vendor`.

---

## 2. Test matrix (run in this order; stop & report on first failure)

| # | Path | Steps | Pass criteria |
|---|------|-------|---------------|
| 1 | **Credentials login (migrated user, NO reset)** | `/auth/login` → existing user's email + their ORIGINAL password | Lands `/account`, name in header. Proves bcrypt hash migrated + verified by NextAuth. |
| 2 | **Register new (dual-write)** | `/auth/login` → create account → throwaway email + `Testpass1!` | Lands logged-in. New id appears in BOTH Supabase + MySQL (`auth_users`/`profiles`). |
| 3 | **Session persists** | Refresh `/account`; open `/account/orders` | Still logged in (NextAuth JWT cookie survives reload). |
| 4 | **Browse → cart** | Add 2 products; open cart | Cart shows items, totals correct (cart RPCs resolve by the NextAuth id). |
| 5 | **Checkout + pay (money path)** | Checkout → calc-totals → Razorpay test pay → success | Order created; `/account/orders` shows it; MySQL `orders` mirrored; cart cleared in both stores. **This is the critical one.** |
| 6 | **Influencer dashboard** | Log in as an influencer → `/influencer` | Summary/wallet/promos/payouts load (converted to `useAuthSession`); create a promo → saves. |
| 7 | **Admin gating** | Log in as admin → `/admin` | Admin pages load (role read from NextAuth JWT). Then log in as a NON-admin → `/admin` blocked/redirected. |
| 8 | **OAuth (only if env set)** | `/auth/login` → Continue with Google/Facebook | Returns logged-in; `auth_accounts` row links to the user. ⚠️ See §5 OAuth caveat. |
| 9 | **Logout** | Header → logout | Session cleared; visiting `/account` redirects to `/auth/login`. |
| 10 | **Vendor untouched** | `/vendor/login` | Still the Supabase vendor flow — unchanged (NOT migrated). |

---

## 3. Log signals to watch (single dev server terminal)

- ✅ `POST /api/auth/callback/credentials 200` on login #1/#2.
- ✅ `/api/me/*`, `/api/influencer/*`, `/api/admin/*` return 200 (not 401) while logged in.
- ✅ `mirrorOrderIntoMysql` / `clearCartMysql` run after pay (#5) — no thrown errors.
- 🚩 `401 unauthenticated` while visibly logged-in → the route isn't reading the NextAuth session
  (check it goes through `getRouteUser`/`requireAdmin`, and the client fetch sends `credentials:"include"`
  OR is same-origin).
- 🚩 `TypeError ... 'call'` in a `next/headers` chunk → `.next` corruption (two servers). Redo Pre-flight #1.
- 🚩 `[authOptions] createUser profiles upsert failed` → OAuth signup couldn't write MySQL profiles.

---

## 4. Rollback (instant, total)

Remove (or set to anything other than `nextauth`) both vars and restart:
```
# delete these two lines from .env.local:
# AUTH_BACKEND=nextauth
# NEXT_PUBLIC_AUTH_BACKEND=nextauth
rm -rf .next && npx next dev -p 3001
```
Steps A–D all keep the Supabase path intact, so unsetting reverts everything to Supabase auth with
zero data changes. No migration is undone — orders/cart/profiles already mirror regardless of backend.

---

## 5. Known limitations UNDER the flip (expected, not bugs)

- **OAuth ⚠️ (Google/Facebook):** NextAuth auth works, but an OAuth user created under NextAuth gets a
  MySQL `profiles` row only (via `authOptions.events.createUser`), NOT a Supabase `auth.users`/`profiles`
  row. Consequences until OAuth dual-write is added: (a) the Supabase-reading email-verification gates
  (`requireEmailVerified` → checkout/payout/reviews) won't see them, so they sit in "grace" then block;
  (b) the vendor app (Supabase) can't see them. **Credentials register dual-writes both stores and has
  none of this** — prefer credentials for the first production cutover; treat OAuth as a fast-follow.
- **Admin K-Partnership video upload** (`/admin/cms/k-partnership-videos`) signs a *direct Supabase-Storage*
  XHR with the Supabase token → breaks under nextauth. Belongs to the **Storage→S3** phase, not this flip.
- **Password reset / email change** are still Supabase-auth flows. Existing users keep their bcrypt hash
  (login works); these self-service flows need NextAuth equivalents before they're relied on in prod.

---

## 6. Post-cutover (later, separate work — do NOT block the flip on these)

- OAuth dual-write to Supabase `profiles` (+ optional shadow `auth.users`) to close §5 OAuth gap.
- Storage → S3 (frees the k-partnership uploader + any direct-storage paths).
- NextAuth password-reset + email-change flows.
- Once BOTH apps (incl. vendor) are off Supabase Auth: retire Supabase Auth + the `/api/auth/attach`
  bridge + the dual-write to Supabase in `/api/auth/register`.
```
