# Multi-language Implementation (Phase 2)

Authoritative reference for the multi-language work. Created at the end of the implementation push so future-you can resume without re-deriving everything from the code.

**Last updated:** 2026-05-14
**Current state:** Phase 2.4 complete. The shopping funnel and admin translation layer are fully operational across 8 non-source locales. A handful of low-impact surfaces are explicitly deferred (listed under "Loose ends" below). Backfill of all four database content types is complete except for 18 rows on one specific product (`eleven-huesday-skintectonic-soothing-sun-plus-spf-50-pa`) — the LLM produced invalid JSON for that product across 6 European locales; one focused retry should fix it.

---

## Quick architectural picture

```
                                                 ┌──────────────────────────────────────────────────────────┐
                                                 │                  STATIC UI STRINGS                       │
                                                 │  source: messages/en-IN.json                              │
                                                 │  output: messages/<locale>.json (8 locales)               │
                                                 │  build:  scripts/translate-messages.mjs                   │
                                                 │  cache:  messages/.translation-state.json (source hashes) │
                                                 │  read:   useTranslations() / getTranslations()            │
                                                 └──────────────────────────────────────────────────────────┘

                                                 ┌──────────────────────────────────────────────────────────┐
                                                 │                  DB-BACKED CONTENT                       │
                                                 │  source: products / brands / categories / home_banners    │
                                                 │  output: product_translations / brand_translations /      │
                                                 │          category_translations / banner_translations      │
                                                 │  build:  scripts/translate-content.mjs                    │
                                                 │  runtime: app/api/admin/content-translations/* (Phase 2.4)│
                                                 │  read:   mergeTranslation() helper (lib/contentTranslations)│
                                                 └──────────────────────────────────────────────────────────┘

           CountrySwitcher → cookies (mik_country / mik_locale / mik_currency)
           → middleware seeds on first visit
           → i18n/request.ts resolves locale from cookie
           → providers (LocaleProvider, CountryProvider, NextIntlClientProvider)
```

Two parallel pipelines (static + dynamic), same Anthropic Haiku 4.5 model, same diff-aware + value-drift logic, same `source = 'human' | 'ai'` flag so admin overrides survive future re-runs.

---

## Locales

Defined in [lib/locales.ts](lib/locales.ts).

| Code | Language | URL prefix |
|---|---|---|
| `en-IN` | English (India) — **source of truth** | none |
| `en` | English (generic) | none (cookie-based) |
| `pl` | Polish | none |
| `vi` | Vietnamese | none |
| `fr` | French | none |
| `de` | German | none |
| `es` | Spanish | none |
| `it` | Italian | none |
| `pt` | Portuguese | none |

`localePrefix` is currently `"never"` (cookie-based). Switching to `"as-needed"` (URL prefixes for non-default locales) is a future migration documented under "Next phases".

15 countries are supported in [lib/countries.ts](lib/countries.ts), each with a default locale + default currency.

---

## Phase 2.1 — Foundation

Set up next-intl, locale/currency/country contexts, the single country switcher in the header, and middleware to seed visitor preferences from geo.

**Key files:**
- [i18n/routing.ts](i18n/routing.ts), [i18n/navigation.ts](i18n/navigation.ts), [i18n/request.ts](i18n/request.ts) — next-intl config
- [lib/locales.ts](lib/locales.ts), [lib/countries.ts](lib/countries.ts) — pure data
- [lib/contexts/LocaleContext.tsx](lib/contexts/LocaleContext.tsx), [lib/contexts/CountryContext.tsx](lib/contexts/CountryContext.tsx) — SSR-safe contexts
- [components/CountrySwitcher.tsx](components/CountrySwitcher.tsx) — single switcher with 3 tabs (Country / Language / Currency)
- [middleware.ts](middleware.ts) — seeds `mik_currency`, `mik_country`, `mik_locale` from geo on first visit
- [app/layout.tsx](app/layout.tsx) — reads cookies SSR-side, sets `<html lang>`, wires providers
- [app/api/user/preferences/route.ts](app/api/user/preferences/route.ts) — persist preferences to `profiles.preferred_locale / preferred_country`
- [lib/contexts/AuthContext.tsx](lib/contexts/AuthContext.tsx) — `register()` seeds profile from current cookies; `login()` restores cookies from profile (reloads page on cookie drift)

**Migration:** `supabase/migrations/20260516_profile_locale_country.sql` (adds `preferred_locale`, `preferred_country` columns to `profiles`).

---

## Phase 2.2 — Static UI translation

Translation pipeline for hardcoded English strings in components / pages. Source of truth is `messages/en-IN.json`; the script translates into all 8 target locales.

**Pipeline:** [scripts/translate-messages.mjs](scripts/translate-messages.mjs)
- Chunked per top-level namespace (one Anthropic call per namespace per locale)
- Throttled (250ms between calls)
- Uses Haiku 4.5 (cheap, idiomatic enough for short UI strings)
- **Diff-aware**: skips namespaces where the key set hasn't changed
- **Value-drift detection**: stores a SHA-1 of each namespace's source content per locale in `messages/.translation-state.json`. Edits to source values trigger re-translation of just the affected namespace.

**Usage:**
```bash
node scripts/translate-messages.mjs                # diff-aware, all locales
node scripts/translate-messages.mjs --force        # full rebuild
node scripts/translate-messages.mjs --force pl     # full rebuild, just Polish
node scripts/translate-messages.mjs pl vi          # diff-aware, restricted to these
```

**Translation state cache:** [messages/.translation-state.json](messages/.translation-state.json) — auto-managed by the script. Commit it (recommended) so re-runs across machines are consistent. Add to `.gitignore` if you'd rather not.

**Source bundle:** [messages/en-IN.json](messages/en-IN.json) — 33 namespaces, ~700 keys. Top-level namespaces: `common`, `header`, `footer`, `cart`, `auth.signIn/signUp/forgot/reset`, `home`, `pcard`, `cookieConsent`, `intlOrder`, `kplusBanner`, `kplusPage`, `searchPage`, `searchAuto`, `productFilters`, `categoryPage`, `brandsPage`, `brandPage`, `bestSeller`, `bundlesPage`, `shop199Page`, `aboutPage`, `contactPage`, `faqPage`, `servicesPage`, `orderSuccess`, `orderFailure`, `account`, `membershipCard`, `pdp`, `checkoutPage`, `floatingWhatsapp`, `influencerRequest`, `influencer`.

**Pages and components wired to `useTranslations()` / `getTranslations()`:**

Pages (24):
- `app/page.tsx` (home, server component)
- `app/cart/page.tsx`
- `app/search/page.tsx`
- `app/best-seller/page.tsx`, `app/bundles/page.tsx`, `app/shop-199/page.tsx`
- `app/brands/page.tsx`, `app/brand/[slug]/page.tsx`, `app/c/[slug]/page.tsx`
- `app/auth/login/login.tsx`, `app/auth/register/register.tsx`, `app/auth/forgot/page.tsx`, `app/auth/reset/reset.tsx`
- `app/account/page.tsx`, `app/account/orders/page.tsx`, `app/account/settings/page.tsx`, `app/account/wishlist/page.tsx`
- `app/order/success/page.tsx`, `app/order/failure/page.tsx`
- `app/contact/page.tsx`, `app/about/page.tsx`
- `app/products/[slug]/product.tsx` (PDP)
- `app/checkout/checkout.tsx` (visible strings; debug panel stays English)

Shared components (15):
- `components/Header.tsx`, `components/Footer.tsx`, `components/CountrySwitcher.tsx`
- `components/ProductCard.tsx`, `components/CookieConsentBanner.tsx`
- `components/InternationalOrderModal.tsx`, `components/KPlusPromoBanner.tsx`
- `components/Certifications.tsx` (sic: filename is `Cetifications.tsx`)
- `components/home/EditorialSection.tsx`, `components/home/HeroBanner.tsx`, `components/home/InstagramVideoCarousel.tsx`, `components/home/BrandCarousel.tsx`, `components/home/VideoReel.tsx`
- `components/FloatingWhatsApp.tsx`, `components/SearchAutocomplete.tsx`, `components/ProductFilters.tsx`, `components/AccountMembershipCard.tsx`
- `components/products/MobileBuyBar.tsx`

**Behaviour decisions baked in:**
- Locale change triggers `window.location.reload()` (in `CountrySwitcher.handleCountry/handleLanguage`) because `NextIntlClientProvider` snapshots messages at SSR.
- `<html lang>` uses `LOCALE_INFO[locale].intlTag` so screen readers + Google get the right region tag (e.g. `pl-PL`, not just `pl`).
- Currency-only changes don't reload; CurrencyContext handles them client-side.

---

## Phase 2.3 — Dynamic content translation

Translates database-backed content (products, brands, categories, banners) into 8 locales.

**Migration:** `supabase/migrations/20260517_content_translations.sql` (applied via Supabase MCP).

**Schema — four translation tables:**

| Table | FK column | Translatable fields |
|---|---|---|
| `product_translations` | `product_id` | `short_description`, `description`, `ingredients_md`, `additional_details_md`, `key_features_md`, `box_contents_md`, `faq` (jsonb), `key_benefits` (jsonb), `additional_details` (jsonb) |
| `brand_translations` | `brand_id` | `description` |
| `category_translations` | `category_id` | `name`, `description` |
| `banner_translations` | `banner_id` | `title`, `alt` |

Every row carries:
- `locale` (text, NOT NULL)
- `source_hash` (sha-1 of source content at translation time — drift detection)
- `source` (`'ai'` or `'human'` — admin overrides flagged so neither script nor save-hook overwrites them)
- `created_at`, `updated_at`
- Unique constraint on `(<fk_column>, locale)`
- Index on `(<fk_column>, locale)` for the storefront's lookup pattern
- RLS enabled with a public SELECT policy; only service-role can write

**Decisions baked in:**
- Product names + brand names → English forever (K-beauty industry norm).
- Category names → translated (UI labels like "Skincare").
- Banner alt + title → translated.
- Only published products are translated (`is_published = true`). Verified at DB level — 0 unpublished rows have ever been translated.
- Brand `description` translation kept on principle even though 19 of 28 brands have no description; the script handles null gracefully (empty input → empty output).

**Pipeline:** [scripts/translate-content.mjs](scripts/translate-content.mjs)
- Same chunking + throttling + diff-aware logic as the UI script
- Reads from Supabase via PostgREST (no `supabase-js` dep)
- Skips rows whose `source_hash` matches (cheap re-runs)
- Skips rows marked `source = 'human'` (admin override protection)
- Per-locale upserts so a mid-run failure still commits earlier locales

**Usage:**
```bash
node scripts/translate-content.mjs                    # all kinds, all locales, diff-aware
node scripts/translate-content.mjs products           # one kind
node scripts/translate-content.mjs products brands    # multiple
node scripts/translate-content.mjs --force            # ignore source hashes
node scripts/translate-content.mjs --locales pl,vi    # restrict locales
```

**Backfill results (2026-05-14):**

| Entity | Source rows | Translation rows landed | Notes |
|---|---|---|---|
| Products (published) | 34 | 254 of 272 expected | **18 missing**: all on `eleven-huesday-skintectonic-soothing-sun-plus-spf-50-pa` across most non-English locales. LLM produced invalid JSON (unescaped quote inside a string). Fixable with a focused retry: `node scripts/translate-content.mjs --force products` after the script's prompt is hardened, OR translate that one product via the admin editor. |
| Brands | 28 | 224 of 224 ✅ | |
| Categories | 4 | 32 of 32 ✅ | |
| Banners (active) | 8 | 64 of 64 ✅ | |

**Storefront merge helper:** [lib/contentTranslations.ts](lib/contentTranslations.ts)
- `mergeTranslation(sourceRow, locale, translatableFields, "<table>_translations")` — takes an embedded translation array and substitutes translatable fields, falling back to English when no row exists for the locale.
- `mergeTranslations(rows, locale, …)` — batch version.
- Constants exported: `PRODUCT_TRANSLATABLE_FIELDS`, `BRAND_TRANSLATABLE_FIELDS`, `CATEGORY_TRANSLATABLE_FIELDS`, `BANNER_TRANSLATABLE_FIELDS`.

**Pages wired to read translations:**
- PDP — [app/products/[slug]/product.tsx](app/products/%5Bslug%5D/product.tsx) — adds `product_translations!left ( locale, … )` to the product fetch, runs `mergeTranslation` before setting state.
- Category — [app/c/[slug]/page.tsx](app/c/%5Bslug%5D/page.tsx) — translates the category name + description AND each product card's `short_description`.
- Brand — [app/brand/[slug]/page.tsx](app/brand/%5Bslug%5D/page.tsx) — brand `description` + product cards.
- Home — [app/page.tsx](app/page.tsx) — `fetchEditorial` now embeds and merges per the active locale (trending + featured carousels).
- Search — [app/search/page.tsx](app/search/page.tsx)
- Best-Seller — [app/best-seller/page.tsx](app/best-seller/page.tsx)
- Bundles — [app/bundles/page.tsx](app/bundles/page.tsx)
- Shop@199 — [app/shop-199/page.tsx](app/shop-199/page.tsx)

**Not wired (deliberate):**
- `getBanners` helper (`app/_data/getBanners.ts`) uses `unstable_cache` + queries `home_banners_live` view. Banner alt/title translations exist in the DB but aren't read on the home page yet. Wiring requires extending the helper signature with `locale` + including it in the cache key. ~30 min job, low impact (banners are mostly visual).
- Cart guest products + account/recently-viewed don't read translations (those surfaces only show product name + price; `short_description` isn't displayed).

---

## Phase 2.4 — Admin translation layer

The operational loop: admins can view/override AI translations, trigger re-translations, and saving a product auto-fires a translation in the background.

**Shared runtime core:** [lib/contentTranslator.ts](lib/contentTranslator.ts)
- TypeScript mirror of the script's translate-one-entity logic.
- Pure functions; the caller (API route) handles DB I/O.
- Exports `KINDS` config (single source of truth — also used by the script's API equivalent), `TARGET_LOCALES`, `translateEntity(opts)`, `pickTranslatablePayload`, `namespaceHash`.
- Same prompt text as the script so AI-translated rows look consistent regardless of which path produced them.

**Admin API:** `app/api/admin/content-translations/`
- `_lib.ts` — admin auth gate (role=admin on profiles), service-role Supabase client, Anthropic key loader.
- `POST /translate` — body `{ kind, id, locales?, force? }`. Diff-aware + human-edit aware.
- `GET /coverage?recentLimit&recentOffset` — summary stats per kind + paginated recent activity (Phase 2.4 + pagination addendum).
- `GET /[kind]?q&limit&offset` — paged + searchable list of entities with per-locale status.
- `GET /[kind]/[id]` — source + all translation rows for the editor.
- `PATCH /[kind]/[id]` — admin saves a field; sets `source = 'human'`.
- `DELETE /[kind]/[id]?locale=X` — drop one translation row.

All routes use the service-role client (translations table has RLS that blocks anon/authed writes; only the script + admin layer can write).

**Admin UI:** `app/admin/translations/`
- **Dashboard** [`/admin/translations`](app/admin/translations/page.tsx) — coverage card per kind (% + bar + per-locale chips). Activity table with prev/next/first/last pagination.
- **Per-kind list** [`/admin/translations/[kind]`](app/admin/translations/%5Bkind%5D/page.tsx) — searchable, per-row "Translate missing" + "Edit" buttons.
- **Per-entity editor** [`/admin/translations/[kind]/[id]`](app/admin/translations/%5Bkind%5D/%5Bid%5D/page.tsx) — locale tab strip (emerald = AI, blue = human, grey = missing), side-by-side editor (English left, target right) for every translatable field. JSON validation for jsonb fields. Save / Re-translate / Force re-translate / Delete buttons.

**Auto-translate on save:** [AdminProductEditor.tsx#L432-L457](app/admin/products/%5Bid%5D/AdminProductEditor.tsx#L432-L457)
- After a successful product save where `is_published=true`, fires `POST /api/admin/content-translations/translate` non-blockingly.
- Admin doesn't wait; translation continues server-side.
- Diff-aware: no API cost when source content hasn't changed.
- Human-locked: never overwrites manually edited rows.

**Status badge:** [components/admin/TranslationStatusBadge.tsx](components/admin/TranslationStatusBadge.tsx)
- "X / 8 locales translated" pill in the product edit page header.
- Click → jumps to the translations editor for that product.
- "N human" sub-badge if any locale is admin-edited.
- Hidden on unpublished drafts.

**Discoverability:** Translations card on [/admin home](app/admin/page.tsx#L441-L463) (icon: `Languages` from lucide-react).

---

## Environment variables

All read from `.env`. Required for the multi-language work:

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | scripts + admin API | LLM calls. Created in Anthropic console (separate from any Claude consumer plan). |
| `NEXT_PUBLIC_SUPABASE_URL` | scripts + admin API | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts + admin API | Bypasses RLS for translation writes. Server-only. |

`SUPABASE_SERVICE_ROLE_KEY` is already used elsewhere in the app — the translation layer adds new consumers, no new secrets.

---

## How to operate

### Adding a new translatable UI string

1. Add the key under the right namespace in `messages/en-IN.json`.
2. Run `node scripts/translate-messages.mjs` — diff-aware, will only re-translate the namespace you touched.
3. Reference via `t("namespace.key")` in your component.

### Editing an existing English UI value

1. Edit the value in `messages/en-IN.json`.
2. Run `node scripts/translate-messages.mjs` — value-drift detection notices the source hash changed and re-translates that namespace.

### Adding a new translatable DB field

1. Add the column to the relevant `*_translations` table (migration).
2. Add the field name to `translatableFields` in `KINDS` (in both `scripts/translate-content.mjs` and `lib/contentTranslator.ts` — they share the structure but live in separate files).
3. Add the field to the constants in `lib/contentTranslations.ts` so the storefront merge helper picks it up.
4. Run `node scripts/translate-content.mjs --force <kind>` to populate.
5. Update PDP / category / wherever the field renders to read the merged value.

### Re-translating a specific product (admin)

1. Go to `/admin/translations/products/<id>`.
2. Pick the locale tab.
3. Click **Re-translate** (or **Force re-translate** if the row is already human-edited).

### Editing a translation manually (admin)

1. Same editor.
2. Type into the right-side textarea.
3. Click **Save (mark human)**. The row is locked from automatic overwrites going forward.

### Deleting a translation (admin)

1. Same editor → **Delete**.
2. The row is removed and the storefront falls back to English for that locale.

### Backfill / bulk translation

```bash
node scripts/translate-content.mjs                    # diff-aware, all kinds, all locales
node scripts/translate-content.mjs products           # restrict to products
node scripts/translate-content.mjs --force            # ignore source hashes; full rebuild
node scripts/translate-content.mjs --locales pl,vi    # restrict locales
```

---

## Loose ends (low-priority, deliberately deferred)

| Item | Where | Why deferred | Effort to close |
|---|---|---|---|
| 18 missing translations on one product | `eleven-huesday-skintectonic-soothing-sun-plus-spf-50-pa` | LLM produced invalid JSON across 6 European locales (`it`, `pt`, `es`, etc.) — string contained an unescaped quote. | ~5 min: open the editor → click Force re-translate per locale, OR strengthen the script's `buildPrompt` rule and re-run `--force` for that product. |
| FAQ page | `app/faq/page.tsx` | Content-heavy; user deprioritised | ~30 min: add keys, refactor |
| Services page | `app/services/page.tsx` | Long-form regulatory copy; specialist review preferred | ~1 hr |
| K-Plus page | `app/k-plus/page.tsx` | India-only (paid membership); international visitors don't reach it | ~30 min |
| Legal pages | `/terms`, `/privacy`, `/policies/*` | Compliance review required for AI-translated legal text | Indefinite (human translation) |
| Influencer pages | `/influencer-request`, `/influencer/*` | Explicitly skipped per user | — |
| Banner alt/title rendering on home | `app/_data/getBanners.ts` | Helper uses `unstable_cache` + reads view; signature change required | ~30 min |
| Cart + account/recently-viewed translated `short_description` | `app/cart/page.tsx`, `app/account/page.tsx` | Those surfaces don't actually render `short_description` | ~30 min if needed later |
| SEO `<title>` / OG metadata per locale | every `export const metadata` | Separate phase | ~2–3 hr |
| Email templates (order confirm, password reset, contact) | `app/api/.../*` | Agreed to stay English | ~2 hr |
| `auth/callback`, `rl/[id]` | Transient redirect pages | Not user-readable | — |

---

## Deferred: Multi-country contact details (paused 2026-05-15)

The site has a single `store_settings` row (id=1) holding the legal entity name, registered address, public phone, support email, business hours, Grievance Officer details, GSTIN, CDSCO registration, jurisdiction city. It's read via [lib/businessInfo.ts](lib/businessInfo.ts) and rendered on ~12 surfaces:

- Customer-facing: contact, about, FAQ, terms, privacy, all 4 policy pages, footer disclosures
- System emails: order confirmation, payment failure (`razorpay/verify`, `international-order`)
- Floating WhatsApp button + contact form CTA (separate `WHATSAPP_PHONE_NUMBER` in [lib/config/site.ts](lib/config/site.ts))
- Admin: `/admin/settings`

**Requirement**: different contact details per country, with the option to *share* one set across multiple countries (e.g. one set for all GCC countries, one for all EU).

**Two implementation paths considered**:

1. **Contact Profiles** (recommended): `contact_profiles` table (one row per distinct contact set) + a `country → profile_id` mapping table. Admin edits each profile once and assigns N countries to it. No data duplication; clean to add/remove countries from a profile.
2. **Per-country `store_settings` rows**: add `country` column to `store_settings`, copy the IN row per country, override only the fields that differ. Simpler but re-types shared values across countries.

**When to resume**: after international payments ship. Prerequisite for region-specific compliance copy (Grievance Officer must be local to each market) and for the "Contact us" CTA in international shipping confirmations.

**Estimated effort**: 4–6 hr for the profile approach including migration + admin UI + reader-side fallback.

---

## Next phases (candidates)

Listed in rough priority order based on customer-facing impact vs effort.

### Phase 2.5 — SEO + email + cleanup (recommended)

Close the customer-touching gaps without scope creep.

1. **SEO metadata localization** — wire `<title>`, `og:title`, `og:description` per locale on every page that exports `metadata`. Use `getTranslations()` in the metadata function. Real SEO win in target markets.
2. **Email template translation** — order confirm, password reset, contact form. Extend the translation pipeline to JSON template files; SES bodies become `t(...)` calls.
3. **Banner alt/title rendering** — extend `getBanners` with a `locale` param + include in the cache key. Read `banner_translations` and substitute.
4. **Retry the 18 failing translations** — strengthen the JSON-output rule in `lib/contentTranslator.ts` prompt OR translate that one product via the admin editor.
5. **Optional**: FAQ + Services pages (the last two visible-but-English customer pages).

Combined effort: ~6–8 hr. Closes Phase 2 properly.

### Phase 2.6 — URL prefix routing

Switch from `localePrefix: "never"` to `"as-needed"`. Non-default locales get URL prefixes (`/pl/products/foo`). Better for SEO + shareability + crawler indexability.

Requires moving customer routes under `app/[locale]/` (the move we deferred in Phase 2.1). One-shot ~4 hr refactor, then a `Link` import sweep across components from `next/link` to `@/i18n/navigation`.

### Phase 2.7 — Translation operations

Make the translation layer self-maintaining.

1. Daily cron via Vercel/Netlify scheduled function: `node scripts/translate-content.mjs` (diff-aware, so only drifted rows hit the API).
2. Slack/email notification when AI translations fail.
3. Bulk "Translate everything missing" button on the admin dashboard.
4. Translation memory / glossary so identical phrases ("Add to Cart") always translate identically.

### Phase 3 — Localized commerce

The bigger work that goes beyond *display*. Currently every non-INR shopper goes through the manual international-order request flow.

1. Localized shipping zones + carrier pricing per market.
2. VAT / sales tax per market.
3. Local payment methods (PayU for Poland, Mollie / Stripe for EU, etc. — Razorpay only handles India).
4. Per-market product visibility (some K-beauty SKUs can't ship to certain countries due to ingredient regulations).
5. Per-market pricing strategy (different margins per country).

This is properly its own multi-week project.

### Future / nice-to-have

- RTL language support (Arabic, Hebrew). `rtl` flag exists in `LOCALE_INFO` but no CSS/`dir` wiring yet.
- Per-locale product variants (different images, different copy beyond translation — e.g. region-specific marketing claims).
- Admin "diff view" — when source content changes, surface a list of locales that would be re-translated next run so admin can pre-approve or human-edit first.
- Per-translation comments / approval workflow.

---

## Translation costs (rough)

Based on actual usage so far with Claude Haiku 4.5:

| Operation | Approximate cost |
|---|---|
| Backfill of static UI strings (33 namespaces × 8 locales) | ~$0.20 |
| Backfill of all DB content (34 products + 28 brands + 4 categories + 8 banners × 8 locales) | ~$1.00 |
| Re-translating one product across 8 locales (admin click) | ~$0.05 |
| Diff-aware re-run with no changes | $0 (no API calls) |
| Adding a new namespace with ~20 keys, all 8 locales | ~$0.01 |

So translation is operationally cheap. Long descriptions are the main cost driver — most of the per-row cost is the LLM generating multi-paragraph translations of product descriptions.

---

## Quick reference — files

```
i18n/
  routing.ts
  navigation.ts
  request.ts

lib/
  locales.ts
  countries.ts
  contextTranslations.ts            ← STOREFRONT helper (merge)
  contentTranslator.ts              ← ADMIN runtime translator (Phase 2.4)
  contexts/
    LocaleContext.tsx
    CountryContext.tsx

messages/
  en-IN.json                         ← source of truth
  en.json, pl.json, vi.json, fr.json, de.json, es.json, it.json, pt.json
  .translation-state.json            ← source-hash cache (auto-managed)

scripts/
  translate-messages.mjs             ← static UI translator
  translate-content.mjs              ← DB content translator

app/
  layout.tsx                         ← reads cookies, wires providers, sets <html lang>
  api/
    user/preferences/route.ts        ← cookie ↔ profile sync (Phase 2.1)
    admin/
      content-translations/
        _lib.ts
        translate/route.ts
        coverage/route.ts            ← summary + paginated activity
        [kind]/route.ts
        [kind]/[id]/route.ts
  admin/
    translations/
      page.tsx                        ← dashboard
      [kind]/page.tsx                 ← list
      [kind]/[id]/page.tsx            ← editor

components/
  CountrySwitcher.tsx
  admin/
    TranslationStatusBadge.tsx
    AdminBackBar.tsx

supabase/migrations/
  20260516_profile_locale_country.sql
  20260517_content_translations.sql
```
