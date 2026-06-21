# MadenKorea — Developer Handoff

Read this first. The app is **mid-migration** to new backends, running a **dual-write**
(strangler-fig) architecture. It is **deployable and stable**, but you MUST understand the
flags and the two "do-not"s below before touching production.

---

## 1. The architecture in one paragraph
Originally 100% Supabase (Auth + Postgres + Storage). It's being moved to **NextAuth** (auth),
**MySQL via Prisma** (database), and **AWS S3 + CloudFront** (storage), one dial at a time, behind
env flags. Today: **Supabase is still authoritative for every WRITE and the money/payment path;
MySQL is a READ-mirror** that serves the storefront/account/admin-product reads. Every write goes
to Supabase, then is mirrored into MySQL.

## 2. The flags (the whole control surface)
| Flag | Value in prod | Controls |
|---|---|---|
| `AUTH_BACKEND` / `NEXT_PUBLIC_AUTH_BACKEND` | `nextauth` | Login/session via NextAuth (MySQL users) vs Supabase Auth |
| `NEXT_PUBLIC_STORAGE_BACKEND` (+ `NEXT_PUBLIC_MEDIA_CDN_URL`) | `s3` | Media from S3/CloudFront vs Supabase Storage |
| `CATALOG_BACKEND` | `mysql` | Storefront/account READS from MySQL vs Supabase |
| `MONEY_BACKEND` | **unset / not `mysql`** | Cart+order+payment on MySQL vs Supabase. **LEAVE OFF.** |

## 3. ⛔ The two ways to break this — DO NOT
1. **Do NOT set `MONEY_BACKEND=mysql`.** The MySQL money path is **built but unfinished**
   (`razorpay/verify` not ported) and **dormant**. Flipping it on **breaks checkout**.
2. **Do NOT delete/disable Supabase.** It is authoritative for all writes + the payment flow.
   Removing it = data loss + broken payments. Full removal is the unfinished Phase 2–4 work.

## 4. What reads/writes from where
- **MySQL serves READS:** storefront (home, products, PDP, categories, search, brands, videos,
  K-Partnership, translations), cart display + checkout totals, account (orders/addresses/
  memberships), influencer dashboard, **admin product list**.
- **Supabase is authoritative for ALL WRITES** (cart, orders, payments, every admin/CMS edit,
  register, reviews, etc.) — each write is then mirrored into MySQL. Plus reads for: admin CMS
  *list* pages, the money path, and Supabase-Auth user lookups.
- **S3/CloudFront:** all media. Nothing media touches Supabase/MySQL.
- Full detail: `migration/SUPABASE_DECOMMISSION.md`, `migration/MYSQL_DUALWRITE_GAPS.md`,
  `CODEBASE_REFERENCE.md` → "Backend Migrations".

## 5. Keeping the dual-write healthy (IMPORTANT)
The write→MySQL mirror is **best-effort** — on a MySQL blip it silently lags, so MySQL can drift
from Supabase. Use these (in `migration/etl/`). They **auto-discover EVERY table** (all 100+,
including `vendors`/`vendor_members`) and exclude only the NextAuth-native tables (`auth_users` —
holds the migrated bcrypt passwords — `auth_accounts`, `auth_sessions`, `auth_verification_tokens`)
and `_prisma_migrations`. **Never re-sync `auth_*` from Supabase — it would wipe the passwords.**
- **`full-resync.mjs`** — full Supabase→MySQL replicate of every table (paginated, batched,
  per-table rollback-on-error). Run after seeding a fresh MySQL. (Verified: 103 tables, 0 failed.)
- **`test-consistency.mjs`** — row-count compare Supabase vs MySQL for every table.
- **`heal-drift.mjs`** — detect drift + auto re-sync only the drifted tables. **Run plain nightly
  via cron** so the mirror self-heals; **`--check`** for monitoring (exit 1 on drift). ← do this.
- `resync-drift.mjs` — re-sync a named subset.
All read Supabase (service-role) + MySQL (Prisma) from `.env.local`.

**`events` is special:** it's the analytics table, written on every page view, so its count grows
continuously and will *always* show transient drift — that's benign. The nightly heal re-snapshots
it. At production scale a full re-sync of `events` gets heavy; consider an **incremental** sync
(only new rows) or simply reading analytics from Supabase and dropping `events` from the mirror.

## 6. Production deploy checklist
1. **Provision a production MySQL**, then `node migration/etl/full-resync.mjs` to seed it from
   prod Supabase, then `test-consistency.mjs` to confirm 0 drift. Point `DATABASE_URL` at it.
2. **Set prod env on the host:** `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `AUTH_BACKEND`+
   `NEXT_PUBLIC_AUTH_BACKEND=nextauth`, Google/Facebook OAuth keys, **AWS server creds**
   (`AWS_ACCESS_KEY_ID/SECRET` — not a profile), `S3_MEDIA_BUCKET`, `AWS_REGION`,
   `NEXT_PUBLIC_STORAGE_BACKEND=s3`, `NEXT_PUBLIC_MEDIA_CDN_URL`, `CATALOG_BACKEND=mysql`,
   `DATABASE_URL`. **Keep** Supabase + Razorpay + SES vars. **Do NOT set `MONEY_BACKEND`.**
3. Add **production** OAuth callback URLs (`/api/auth/callback/{google,facebook}`) in the consoles;
   Facebook app in **Live** mode.
4. `npm run build` passes (note: `next.config.js` ignores type/lint errors; ~84 pre-existing TS
   errors are expected. Run `npm run typecheck` separately if needed).
5. **Browser QA**, incl. a **real Razorpay test-card checkout** (the one thing automation can't do)
   — prompts in `migration/BROWSER_E2E_TEST.md` + `BROWSER_ADMIN_CRUD_TEST.md`.
6. Schedule `heal-drift.mjs` nightly.

## 7. Status — done vs pending
- ✅ **Auth (NextAuth):** all flows ported (login, OAuth, reset, change, email-change, influencer).
- ✅ **Storage (S3+CloudFront):** migrated + verified.
- ✅ **DB reads + dual-write:** storefront/account on MySQL; all admin/CMS writes mirror to MySQL
  (proven; see `migration/etl/test-*.mjs`). MySQL fully replicated from Supabase.
- ⏸️ **Money path on MySQL (Phase 2):** logic built, `razorpay/verify` NOT ported, **dormant**
  behind `MONEY_BACKEND`. Finish + flag-on + Razorpay test card before ever enabling.
- ⬜ **Phase 3–4 (drop Supabase):** not done. `supabase.auth.admin.*` still used; Supabase stays.

## 8. Known open issues (not blockers)
- Guest cart/wishlist don't **merge on login**.
- Admin **deep-link/refresh** of `/admin/...` sub-routes renders blank (use in-app nav).
- **Vendor product list** writes Supabase only (no MySQL mirror — intentionally skipped).
- Admin CMS *list* reads still hit Supabase; analytics page shows mock figures; duplicate page titles.

## 9. Where to dig
`CLAUDE.md` (orientation) → `CODEBASE_REFERENCE.md` (the map) → the `migration/*.md` runbooks.
Dual-write code: `lib/data/mirror.ts` (`mirrorTableToMysql`), `lib/admin/mirror-mysql.ts`
(`mirrorMysql`), `/api/admin/catalog/*`, `lib/data/*` (MySQL read/port helpers). Auth seam:
`lib/auth/routeUser.ts`, `lib/supabaseRoute.ts` (`supabaseForUser`/`rpcForUser` + `_as` wrappers).
