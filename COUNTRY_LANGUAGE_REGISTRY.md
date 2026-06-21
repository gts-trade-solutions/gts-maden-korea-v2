# Country / Language / Currency Registry — admin-managed catalog

Plan for moving countries, languages, and country↔currency mapping from
hardcoded code constants into admin-managed DB tables, with a new
`/admin/countries` portal section.

- **Status:** spec locked, code not started.
- **Last updated:** 2026-05-29.
- **Estimated effort:** 1.5–2 days end-to-end (migration + reader refactor + UI + smoke).

---

## Goal

A single Country Manager surface in the admin where staff can:

- Add / edit / activate / deactivate countries (ISO-2 + display attributes).
- Add / edit / activate / deactivate languages (ISO 639 codes).
- Add / edit / activate / deactivate currencies (already exists at
  `/admin/settings/currencies` — gets a stronger link from the new
  Country Manager).
- Assign one or more languages to each country, with one default.
- Assign one default currency per country.
- See per-country usage stats so deactivation decisions are informed.

The end state: nothing about country/language/currency identity lives
in `lib/countries.ts` / `lib/locales.ts` / `lib/currency.ts`. Those
modules become thin wrappers around a DB-backed registry.

---

## What exists today

| Concern | Storage | Source of truth |
|---|---|---|
| Countries | [lib/countries.ts](lib/countries.ts) — hardcoded `COUNTRY_PROFILES` map of 15 entries | Code constants |
| Languages | [lib/locales.ts](lib/locales.ts) — hardcoded `SUPPORTED_LOCALES` (9 entries) + `messages/<code>.json` files | Code constants + files |
| Currency rates | `public.currency_rates` table + [lib/currency.ts](lib/currency.ts) (`FALLBACK_RATES`, `CurrencyCode` type) | DB primary, code constants as fallback / type system |
| Country → currency mapping | [lib/currency.ts](lib/currency.ts) — hardcoded `COUNTRY_TO_CURRENCY` map (~30 entries including Eurozone geo-detection codes) | Code constants |
| Country → format-locale mapping | [lib/currency.ts](lib/currency.ts) — hardcoded `FORMAT_LOCALE` map | Code constants |
| Currency admin page | `/admin/settings/currencies` (already exists, DB-driven) | Already done |

So currencies are already half DB-driven. Countries and languages are
fully hardcoded.

---

## The "vocabulary" boundary

Some parts of country/language/currency identity can't be fully
admin-managed because the codebase needs corresponding files or
imports:

| Capability | Admin-only? | What needs code |
|---|---|---|
| Add country code with name / flag emoji / default language / default currency / active toggle / sort | yes | — |
| Add language code with name / native name / RTL / active toggle | yes | — |
| Add currency code with name / symbol / decimals / rate-from-INR / active | yes | — |
| Country flag rendering | no | One named import in [components/CountryFlag.tsx](components/CountryFlag.tsx) per ISO-2 |
| Language UI translations | no | `messages/<code>.json` file |
| Currency display formatting | yes | Native `Intl.NumberFormat` handles any ISO-4217 |

**Practical rule:** admin can configure everything in the codebase's
"vocabulary." Adding a brand-new country code or locale that the code
has never seen needs one corresponding code addition (flag import or
messages file). The admin UI surfaces this constraint with status
chips on each row (green = fully supported, amber = data row exists
but assets missing).

---

## Schema — 3 new tables, 1 existing reused

### `countries` (new)

```sql
create table public.countries (
  code               text primary key,                                  -- ISO-2: IN, US, ...
  name               text not null,                                     -- "India"
  native_name        text,                                              -- "भारत"
  flag_emoji         text,                                              -- "🇮🇳"
  default_locale     text references public.languages(code) on delete restrict,
  default_currency   text references public.currency_rates(code) on delete restrict,
  is_active          boolean not null default true,
  sort_order         int not null default 0,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_countries_active on public.countries (is_active) where is_active = true;
create index idx_countries_sort on public.countries (sort_order);
```

### `languages` (new)

```sql
create table public.languages (
  code               text primary key,                                  -- "en", "en-IN", "hi", ...
  name               text not null,                                     -- "Hindi"
  native_name        text,                                              -- "हिन्दी"
  is_rtl             boolean not null default false,
  is_active          boolean not null default true,
  sort_order         int not null default 0,
  -- Auto-detected at app boot by checking whether messages/<code>.json
  -- is bundled. Admin UI shows this read-only; admin can save a row
  -- without the file but the storefront falls back to English until
  -- the file lands.
  messages_available boolean not null default false,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_languages_active on public.languages (is_active) where is_active = true;
```

### `country_languages` (new — junction)

```sql
create table public.country_languages (
  country_code   text not null references public.countries(code) on delete cascade,
  language_code  text not null references public.languages(code) on delete restrict,
  is_default     boolean not null default false,
  sort_order     int not null default 0,
  primary key (country_code, language_code)
);
-- Exactly one default language per country.
create unique index ux_country_languages_one_default
  on public.country_languages (country_code) where is_default = true;
```

### `currency_rates` (existing — keep as-is)

No schema change. Used as the FK target for `countries.default_currency`.
The existing admin page at `/admin/settings/currencies` continues to
own currency CRUD.

---

## Reader layer refactor

Goal: keep existing call-sites synchronous so we don't have to rewrite
half the codebase.

### New module: `lib/registry.ts`

```ts
// One-shot load at module init (or first call). Cached in memory
// with a 5-minute TTL + cache-bust webhook on admin save.
export async function loadRegistry(): Promise<RegistrySnapshot>

// Synchronous getters — read from the in-memory snapshot.
// Throws if loadRegistry() hasn't completed yet. App boot must call
// loadRegistry() before serving the first request.
export function countries(): CountryRow[]
export function languages(): LanguageRow[]
export function currencies(): CurrencyRateRow[]
export function countryLanguages(): CountryLanguageRow[]

export function getCountry(code: string): CountryRow | null
export function getLanguage(code: string): LanguageRow | null
export function getCurrency(code: string): CurrencyRateRow | null
export function defaultLanguageFor(countryCode: string): string | null
export function defaultCurrencyFor(countryCode: string): string | null
export function languagesFor(countryCode: string): LanguageRow[]
export function isSupportedCountry(code: unknown): boolean
export function isSupportedLanguage(code: unknown): boolean
export function isSupportedCurrency(code: unknown): boolean

export function bustRegistryCache(): void
```

### Rewrite of existing modules

- [lib/countries.ts](lib/countries.ts) — `COUNTRY_PROFILES`,
  `SUPPORTED_COUNTRIES`, `isSupportedCountry`, etc. become thin
  re-exports / wrappers around `registry.*`.
- [lib/locales.ts](lib/locales.ts) — `SUPPORTED_LOCALES`,
  `DEFAULT_LOCALE`, etc. become wrappers around `registry.languages()`.
- [lib/currency.ts](lib/currency.ts) — `SUPPORTED_CURRENCIES`,
  `CurrencyCode` type, `COUNTRY_TO_CURRENCY`, `FORMAT_LOCALE` go away.
  Replaced with `registry.currencies()` and helper functions like
  `currencyForCountry(code)`.

### Type system

- `CurrencyCode` and `CountryCode` loosen from string-literal unions
  to plain `string`. Runtime validators (`isSupportedCountry()`,
  `isSupportedCurrency()`) check against the DB-driven active set.
- Compile-time safety lost, but admins can add codes the type system
  has never seen. Acceptable trade.

### Cache invalidation

- 5-minute in-memory TTL.
- Admin save fires `POST /api/internal/registry-bust` (private endpoint)
  → all server instances bust their local snapshot → next read
  re-fetches.
- App boot: prefetch the snapshot in the root layout's RSC so the
  first request doesn't pay the cost.

---

## Admin UI — `/admin/countries`

Four tabs.

### Tab 1 — Countries

Table with drag-to-reorder:

| Column | Notes |
|---|---|
| Flag | Emoji + status chip (green = `country-flag-icons` import exists; amber if not) |
| Code | Read-only, ISO-2 |
| Name | Inline edit |
| Default language | Dropdown of that country's assigned languages |
| Default currency | Dropdown of active currencies |
| # languages | Count from `country_languages` |
| `is_active` | Toggle switch |
| Usage stats | "47 products with prices · 12 contacts · 3 orders" (informational; nudges admin away from deletes) |
| Actions | Edit · Delete |

**"Add country" modal:**
- ISO-2 picker (constrained to flag-icon library codes; out-of-list shows warning + asks for code change)
- Name, flag emoji
- Default language (must already exist)
- Default currency (must already be active)

**Per-country detail page** at `/admin/countries/<code>`:
- All fields editable except `code`
- Languages section — list of assigned languages with their `is_default` + `sort_order`
- Delete button (hard-deletes if no FK references; otherwise blocked
  with a counted list of references)

### Tab 2 — Languages

Table:

| Column | Notes |
|---|---|
| Code | Read-only |
| Name | Inline edit |
| Native name | Inline edit |
| RTL | Toggle |
| `messages_available` | Status chip (green if `messages/<code>.json` exists, amber if not) |
| `is_active` | Toggle |
| # countries using as default | Count from `countries.default_locale` |
| Sort | Drag |
| Actions | Edit · Delete |

**"Add language" modal:**
- Code (free text but pattern-validated for ISO 639 + optional region)
- Name, native name
- RTL toggle

### Tab 3 — Currencies

Two presentation choices considered; recommendation is **link out** to
the existing `/admin/settings/currencies` page with a small summary
card inside the Countries tab:

```
┌─────────────────────────────────────────────────┐
│ Currencies                                       │
│ ─────────────────────────────────────────────── │
│ 11 active currencies · last rate update 4h ago  │
│ [Manage currencies →]                            │
└─────────────────────────────────────────────────┘
```

The existing currencies page also gets one enrichment: a "Used as
default in N countries" column so admins can spot which currencies
are load-bearing before deactivating.

### Tab 4 — Country ↔ Language matrix

Grid view, countries down, languages across.

- Checkbox in each cell = "offered"
- Radio button in each cell = "default" (one per row)
- Color-coding: green = fully supported (active country, active lang,
  messages_available); amber = data row only, messages_available=false;
  grey = country or language is inactive

Bulk operations:
- "Offer X in all active countries"
- "Set X as default for all countries"
- "Remove X from all"

Each row also shows the country's currency as informational column at
the right, so admins can quickly spot weird combinations (e.g., Spain
offering EUR-formatted Polish UI).

---

## Edge cases

### Countries

| Case | Behavior |
|---|---|
| Add ISO-2 code with no flag SVG | Block at API with clear message pointing to [components/CountryFlag.tsx](components/CountryFlag.tsx) |
| Deactivate country with `product_country_prices` / `country_contacts` / orders | Allow with warning showing counts |
| Delete (not deactivate) country with any FK reference | Hard-block. Suggest deactivate |
| Change default language of a country | Existing visitor cookies unchanged; new visitors get new default |
| Change default currency of a country | Same — cookies respected for existing visitors; cart line items re-price on next render |
| Visitor's `mik_country` cookie points to deactivated country | Resolver falls back to `DEFAULT_COUNTRY`, banner asks to pick again |
| `profiles.preferred_country` references deactivated country | CountryGate re-asks on next login |

### Languages

| Case | Behavior |
|---|---|
| Add language with no messages JSON | Allow with amber warning; storefront falls back to English for that locale until JSON arrives |
| Deactivate a language that's the default for any country | Block until those defaults are reassigned (show list of countries to fix) |
| Delete a language with any `*_translations` rows OR any country using it as default | Hard-block. Suggest deactivate |
| RTL language added | `<html dir="rtl">` toggles automatically when served in that locale |
| Concurrent admin edits | Optimistic lock via `updated_at`; conflict shows "list changed, refresh?" |

### Currencies

| Case | Behavior |
|---|---|
| Deactivate INR (base currency) | Hard-block. Every price is stored in INR |
| Deactivate a currency that's the default for any country | Block until those defaults are reassigned |
| Delete (not deactivate) a currency that's any country's default | Hard-block. Suggest deactivate |
| Change a currency's `decimals` | Existing `orders.currency` snapshots untouched; new orders use the new value. Document |
| Change `rate_from_inr` | Live — affects display prices immediately for that currency. Cart re-prices on next render. Order snapshots untouched |
| Add a currency the codebase has never seen (e.g., KZT) | Allowed. `Intl.NumberFormat` handles any ISO-4217 |
| `rate_from_inr` set to 0 or negative | Validation blocks save |
| Country's default currency set to inactive currency | Block at save — admin must activate the currency first |

### Country ↔ Language assignment

| Case | Behavior |
|---|---|
| Remove the default language from a country | Block until another language is set as default |
| Mark a language as default that isn't in the country's offered set | Auto-add it to the offered set (default implies offered) |
| Two `is_default=true` rows for same country | Partial unique index blocks at DB level; admin form prevents it at write time |
| Drag-reorder during save | Last-write-wins on `sort_order`; cosmetic only |

---

## Migration / rollout sequence

1. **DB migration** — create 3 tables, seed from current code constants
   (15 countries, 9 languages, existing 11 currencies links). All seeded
   rows `is_active = true` so day-one behavior matches today.
2. **`lib/registry.ts`** — new module with cached snapshot loader +
   sync getters.
3. **Reader-layer refactor** — rewrite [lib/countries.ts](lib/countries.ts),
   [lib/locales.ts](lib/locales.ts), [lib/currency.ts](lib/currency.ts)
   as thin wrappers. Delete hardcoded maps.
4. **Admin UI** — `/admin/countries` with 4 tabs + per-country detail
   page + per-language detail page.
5. **APIs** — `/api/admin/countries`, `/api/admin/languages`,
   `/api/admin/countries/[code]/languages`,
   `/api/internal/registry-bust`.
6. **Smoke test** — country picker · signup form · pricing · contacts
   · partnership videos · shipping · OAuth callback · all locale-aware
   emails. Toggle a country off and on; assign a new language; change
   a default; verify cache invalidates.

Phases 1–5 ship together (they're tightly coupled). Phase 6 is a
deliberate manual pass before flipping any toggles in production.

---

## Coverage check — what the new system replaces

| Today | Replaced by |
|---|---|
| `COUNTRY_PROFILES` in lib/countries.ts | `countries` table |
| `SUPPORTED_COUNTRIES` array | `registry.countries().filter(c => c.is_active)` |
| `DEFAULT_COUNTRY` constant | First entry in seeded `countries` (currently IN) |
| `isSupportedCountry()` | DB-backed validator |
| `SUPPORTED_LOCALES` in lib/locales.ts | `registry.languages().filter(l => l.is_active)` |
| `DEFAULT_LOCALE` constant | Seeded language with `sort_order = 0` |
| `COUNTRY_TO_CURRENCY` in lib/currency.ts | `countries.default_currency` column |
| `FORMAT_LOCALE` in lib/currency.ts | Computed at render: `Intl.NumberFormat(country.default_locale, { currency: country.default_currency })` |
| `SUPPORTED_CURRENCIES` array | `registry.currencies().filter(c => c.active)` (existing table) |
| `CurrencyCode` / `CountryCode` types | Loosened to `string` — runtime validators replace compile-time guards |

---

## Open questions to confirm before execution

1. **Tab 3 (Currencies)** — link out to existing `/admin/settings/currencies`
   vs embed inside `/admin/countries`. Recommendation: link out to avoid
   duplicating the existing page's rate-table operations.
2. **ISO-2 picker constraint** — block codes whose flags aren't bundled,
   or allow with placeholder flag? Recommendation: block. Admin sees a
   clear "add the flag import first" message.
3. **Currency-to-country link strength** — strict (admin can't pick an
   inactive currency as a country's default; deactivating a currency
   in use is blocked) or loose. Recommendation: strict — typos here
   silently break pricing.
4. **`COUNTRY_TO_CURRENCY` breadth** — today's map includes 20+ Eurozone
   country codes for geo-detection that aren't in `SUPPORTED_COUNTRIES`.
   Migration: seed them as `is_active = false` rows so geo-detection
   keeps working but they don't appear in the customer picker. Confirm.
5. **Per-country attributes for v1** — beyond code / name / flag / default
   language / default currency / active / sort: do you want phone-code
   prefix, timezone, calendar week-start, default address format
   (US-style vs Indian-style), measurement units? Recommendation: skip
   for v1, add as needed.
6. **Per-language attributes** — RTL flag + auto-detected
   `messages_available` are in v1. Anything else (date/time format
   default, etc.)?
7. **Editing currency codes** — INR is the base in every price
   computation. Recommendation: hard-block code edits on currency rows
   (same as country/language codes).
8. **Cache invalidation strategy** — 5-min TTL + admin-save webhook to
   bust early. Customers see admin changes within ≤5 minutes by
   default. Confirm interval.
9. **Currency rate freshness display in admin** — show "Last updated X
   hours ago" with amber chip after 24h. Pre-existing currencies page
   may already do something similar.
10. **Backwards-compat for `/admin/settings/currencies`** — keep both
    surfaces vs fold currencies into the new Country Manager.
    Recommendation: keep both. Existing admin muscle memory, and the
    existing page handles rate-table operations well.

---

## Files that will change (when we execute)

### New

- `supabase/migrations/<date>_country_language_registry.sql` — 3 tables + seed
- `lib/registry.ts` — cached registry snapshot + sync getters
- `app/admin/countries/page.tsx` — main 4-tab page
- `app/admin/countries/[code]/page.tsx` — per-country detail
- `app/admin/countries/languages/[code]/page.tsx` — per-language detail
- `app/api/admin/countries/route.ts` — list/create
- `app/api/admin/countries/[code]/route.ts` — read/update/delete
- `app/api/admin/countries/[code]/languages/route.ts` — assignment ops
- `app/api/admin/languages/route.ts` — list/create
- `app/api/admin/languages/[code]/route.ts` — read/update/delete
- `app/api/internal/registry-bust/route.ts` — cache-bust webhook

### Rewritten as thin wrappers

- `lib/countries.ts` — re-exports from `lib/registry.ts`
- `lib/locales.ts` — re-exports from `lib/registry.ts`
- `lib/currency.ts` — re-exports from `lib/registry.ts` + keep
  `roundMoney`, `Intl.NumberFormat` helpers

### Enriched (small additions)

- `app/admin/settings/currencies/page.tsx` — add "Used as default in
  N countries" column
- `app/layout.tsx` — call `loadRegistry()` once at root layout boot
- `CLAUDE.md` — add this doc to the companion list
- `components/admin/AdminHeader.tsx` or similar — add the Countries
  link to the admin nav

---

## When we execute

Confirm the 10 open questions in the section above, then build in this
order:

1. Migration + reader layer (no UI changes, regression-safe)
2. `/admin/countries` UI + APIs
3. Delete old hardcoded maps from `lib/*.ts`
4. Smoke pass through all customer flows in each active country

One PR, ~1.5–2 days of focused work.
