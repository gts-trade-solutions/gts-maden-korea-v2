# Skin Analyzer Integration

Integration spec + build log for wiring the standalone **Skin Analyzer**
(`skinanalyzer.madenkorea.com`, a separate Next 15 / React 19 app) into the
MadeNKorea storefront as a gated feature. Last updated 2026-07-10.

> The analyzer app stays **as-is** for direct visitors (its own home, signup,
> and standalone flow are untouched). Integration is **purely additive**: a new
> `/mk/*` surface on the analyzer that only the MadeNKorea handoff uses.

## Roles

- **MadeNKorea** = authority for **identity**, **entitlement** (1 free scan +
  request-more), and **canonical result storage/display**.
- **Analyzer** = the compute step (camera capture → Face++ → concerns). It acts
  only on a valid signed grant and posts the result back, signed.

## End-to-end flow

1. Home **banner** → MadeNKorea `/skin-analyzer` feature page (login required).
2. **Start** → `POST /api/skin/start`: reserve an entitlement, mint a handoff
   JWT, redirect to `…/mk/enter?t=<jwt>`.
3. Analyzer `/mk/enter` verifies the JWT, sets a scoped `mk_session`, runs the
   capture → Face++ pipeline **once** (`/mk/analyze` + `/api/mk/analyze`).
4. Analyzer stores its own record, then **posts back** (S2S, signed) to
   MadeNKorea `POST /api/skin/callback`.
5. MadeNKorea stores the result, **consumes** the reservation, redirects the
   user to `/account/skin-analysis/[id]` (polls until the callback lands).
6. Out of scans → **Request access** (MadeNKorea) → admin approves in
   `/admin/skin-analysis/requests` → +1 entitlement.

## Contracts (both keyed by the shared secret)

`SKIN_ANALYZER_SHARED_SECRET` (MadeNKorea) **must equal**
`MADENKOREA_SHARED_SECRET` (analyzer).

**Handoff token** — HS256 JWT, 5-min TTL, single-use `jti`. MadeNKorea signs,
analyzer verifies.

```
claims = { iss:"madenkorea", aud:"skin-analyzer", sub:<mk_user_id>,
           email, name, grant_id:<entitlement id>, kind:"face", jti, iat, exp }
```

**Callback signature** — header `X-MK-Signature: t=<unixSeconds>,v1=<hex>` where
`v1 = HMAC_SHA256(secret, "<t>.<rawBody>")`. Analyzer signs, MadeNKorea verifies
(±5 min window). Body carries `analyzer_analysis_id` (idempotency) + `grant_id`.

Implementations (must stay byte-compatible):
- MadeNKorea: [lib/integrations/skinAnalyzer.ts](lib/integrations/skinAnalyzer.ts)
- Analyzer: `lib/mk/crypto.ts`

## Entitlement state machine

```
available ──(Start: reserve, mint JWT, set expires_at)──► reserved ──(callback ok)──► consumed
    ▲                                                          │
    └──────────────(TTL expiry / failure: release)────────────┘   free scan NOT burned
```

- Reservation is **consumed only on a successful callback**.
- Abandoned/failed attempts **auto-release** (lazy expiry on read; TTL ~30 min).
- One active reservation per user at a time (double-Start reuses it).
- `available == 0 && none reserved` → user must Request access.

## Data model (MadeNKorea, MySQL)

New tables (additive; the row id of `skin_entitlements` IS the token `grant_id`):

| Table | Purpose |
|---|---|
| `skin_analyses` | canonical stored analysis; `analyzer_analysis_id` unique = idempotency |
| `skin_analysis_issues` | per-concern rows (type, score, confidence, severity band) |
| `skin_entitlements` | quota lifecycle (`available`/`reserved`/`consumed`/`released`) |
| `skin_access_requests` | "request more" queue, approved in MadeNKorea admin |

Prisma models: end of [prisma/schema.prisma](prisma/schema.prisma).
Migration: [db/migrations/20260710_skin_analyzer_integration.sql](db/migrations/20260710_skin_analyzer_integration.sql)
— **additive, idempotent, safe on production**; run it manually then
`npx prisma generate` (do **not** run `prisma db push` against prod — it would
diff the whole introspected schema).

## Config / env

MadeNKorea `.env`:
```
SKIN_ANALYZER_URL=https://skinanalyzer.madenkorea.com
SKIN_ANALYZER_SHARED_SECRET=<shared value>
```
Analyzer `.env`:
```
INTEGRATION_ENABLED=true
MADENKOREA_SHARED_SECRET=<same shared value>
MADENKOREA_URL=https://madenkorea.com
```

## Security checklist

Shared secret in `.env` only (never logged) · short-TTL single-use handoff JWT ·
HMAC callback over raw body + timestamp + replay window · idempotency on
`analyzer_analysis_id` · entitlement authority server-side only · callback
endpoint rate-limited + signature-gated · HTTPS both ends · **no face image
persisted** (analyzer discards after Face++; MadeNKorea stores derived scores
only).

## Milestones

- **M1 — Foundations** ✅ crypto helpers (both apps) · MadeNKorea data model +
  additive SQL migration · this doc.
- **M2 — Entry + handoff** ✅ (code) `/skin-analyzer` page · `/api/skin/start`
  (reserve + mint) · `/api/skin/status` · `/api/skin/request-access` · analyzer
  `/mk/enter` (verify + `mk_session`) · middleware bypass. Banner = data row (TODO).
- **M3 — Analyze + post-back** ✅ (code) analyzer `/mk/analyze` capture (reuses
  FaceCamera + `/api/detect`) · `/api/mk/analyze` (analyze + signed post-back) ·
  MadeNKorea `/api/skin/callback` (verify + idempotent store + consume) ·
  `/account/skin-analysis` + `/account/skin-analysis/[id]` results pages.
  **Not yet validated** — blocked on `prisma generate` (see below).
- **M4 — Quota + requests** ✅ reservation lifecycle + lazy expiry (in
  `skinEntitlement.ts`) · request-access flow · admin approval at
  `/admin/skin-analysis/requests` (`/api/admin/skin/requests[/id]`) + grant +
  best-effort SES notify.
- **M5 — Hardening** ✅ single-use `jti` replay cache (`lib/mk/replay.ts`,
  wired into `/mk/enter`) · idempotent callback + CAS consume · clock-skew
  window · reservation auto-release on failure. Desktop already works via the
  webcam (`FaceCamera`). **Deferred** (see below).
- **M6 — Fast-follow** concern→catalog product recommendations · richer results
  UI · hair when the provider is wired.

## Deferred (intentional)

- **Desktop→phone QR handoff.** Not needed for function — the `/mk` capture uses
  `FaceCamera`, which works on a desktop webcam. A QR "continue on your phone"
  is a capture-quality nicety; it needs a QR dependency + real cross-device
  testing. The re-entry mechanism (open `/mk/enter?t=<jwt>` on the phone) already
  works; only the QR image rendering is deferred.
- **Background post-back retry queue.** The analyzer retries the callback 3× with
  backoff; if all fail, the reservation auto-releases (free scan preserved) and
  the user retries. A durable retry/reconciliation job is a later add.
- **Automated test runner.** Neither app ships a test runner (jest/vitest). The
  crypto contract was validated ad-hoc; see the smoke-test runbook below.

## Smoke-test runbook (no provider cost)

On the analyzer set `ANALYZER_MOCK=true`, `INTEGRATION_ENABLED=true`, and matching
secrets. Then:

1. Log into MadeNKorea, open `/skin-analyzer` → **Start** → you land on the
   analyzer `/mk/analyze` (proves signed handoff + reservation).
2. Capture (mock returns canned issues) → you're redirected to
   `/account/skin-analysis/[id]` on MadeNKorea (proves post-back + store +
   consume).
3. Revisit `/skin-analyzer` → now shows **Request access** (free scan consumed).
   Submit → approve in `/admin/skin-analysis/requests` → Start works again.
4. Edge checks: reuse a handoff URL → bounced (`token_used`); replay a callback
   (same `analyzer_analysis_id`) → returns the same id, no double-spend; let a
   reservation sit >30 min without finishing → auto-released, free scan intact.

## Scope locked for v1

Skin only (Face++) · auto-redirect back to MadeNKorea for the canonical result ·
clean summary UI (rich later) · desktop → continue-on-phone · results-only
storage (no selfie) · self-contained v1 (product recs as M6).
