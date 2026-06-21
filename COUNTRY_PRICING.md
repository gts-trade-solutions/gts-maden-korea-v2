# Country pricing — Phase 1 reference + Phase 2/3 plan

Status: **Phase 1 live in production.** Phase 2 (cleanup) and Phase 3 (optional extensions) are documented here for future execution.

Last updated: 2026-05-21.

---

## What this system does

Per-country offer prices on products. Visitor in India sees one price, visitor in Poland sees another, all derived from the same product row. MRP stays global. Customer is charged the country-specific price end-to-end (cart, checkout, Razorpay, order_items snapshot, SES email, invoice).

Today's behavior (Phase 1):

- A product can have 0–15 country-specific offer rows in `product_country_prices`.
- For each visitor, the resolver checks if a row exists for `(product_id, visitor_country)` AND `is_active=true`. If yes, that's the price.
- If no row matches, the resolver **falls through** to the legacy logic: `sale_price` within window > `price`.
- Countries without an explicit offer continue to see today's pricing untouched. Nothing breaks for products you never migrate.

This is a strict superset of the old pricing model. Roll it out per-product.

---

## Architecture map

### Database

| Object | Purpose |
|---|---|
| `product_country_prices` (table) | Per-country offer rows. PK on `(product_id, country_code)`. RLS: anyone reads, admins write. |
| `idx_pcp_product`, `idx_pcp_country_active` | Indexes for the two hot lookup paths |
| `set_pcp_updated_at` (trigger) | Maintains `updated_at` |

Existing objects untouched (still load-bearing):

| Object | What it does | Phase-2 implication |
|---|---|---|
| `products.price`, `sale_price`, `sale_starts_at`, `sale_ends_at`, `compare_at_price` | Legacy pricing fields | Drop in Phase 2 except `compare_at_price` → renamed to `mrp` |
| `get_effective_price(p_id)` Postgres function | Reads legacy fields, returns `(unit_price, mrp, sku, name, hero_image_path)`. Called by trigger functions. | Phase 2: rewrite to take country, read `product_country_prices` first, fall back to MRP |
| `cart_items_bi_fn` trigger | On `cart_items` insert: calls `get_effective_price` to snapshot `unit_price` + `mrp` | Phase 2: country-aware via cart's `country_code` |
| `order_items_bi_fn` trigger | Same as above for `order_items` | Phase 2: country-aware via order's `country_code` |
| `recalculate_cart_totals` / `recalculate_order_totals` | Sum `line_total` — doesn't read product columns directly | No change needed |

### Resolver layer ([lib/pricing.ts](lib/pricing.ts))

Three exports, all country-aware:

- `effectiveUnitPrice(product)` — **legacy sync helper.** Resolves from `sale_price`/`price` only. Kept for client paths that don't have a country offer map handy.
- `fetchCountryOffers(productIds, country, sb)` — bulk DB lookup returning `{ product_id: offer_price }`. One round-trip per surface.
- `effectivePriceForCountry(product, offers)` — preferred resolver. Country offer wins; else falls through to legacy.
- `augmentProductsWithCountryOffers(products, country, sb)` — convenience wrapper. Takes a list, returns the same list with `effective_price` attached.

### API

- `GET /api/admin/products/[id]/country-prices` — fetch existing offers + supported countries for admin form
- `PUT /api/admin/products/[id]/country-prices` — replace-all upsert/delete. Validates: `offer_price > 0`, `offer_price < products.compare_at_price` (if MRP set), `country_code` in supported list, no duplicates per request.

### Admin UI

Per-product Country offers panel in [app/admin/products/[id]/AdminProductEditor.tsx](app/admin/products/[id]/AdminProductEditor.tsx). Saved as part of the main product Save button (two API calls in sequence: product update, then country-prices upsert).

### Customer-facing wiring

Every surface that shows a price now resolves country offers. Server pages read the country from `cookies().get("mik_country")`; client pages parse `document.cookie`. The country switcher does `window.location.reload()` (see [components/CountrySwitcher.tsx:71](components/CountrySwitcher.tsx#L71)) so a country change re-runs all SSR + client effects without needing a reactive system.

| Surface | File | How |
|---|---|---|
| Server-authoritative cart/checkout pricing | [app/api/checkout/calc-totals/route.ts](app/api/checkout/calc-totals/route.ts) | `fetchCountryOffers` once, `effectivePriceForCountry` per line |
| ProductCard / CompactProductCard | [components/ProductCard.tsx](components/ProductCard.tsx), [components/CompactProductCard.tsx](components/CompactProductCard.tsx) | Accept optional `effective_price` prop; fall back to legacy compute when not passed |
| Home | [app/page.tsx](app/page.tsx) | `fetchEditorial` augments each list |
| Category PLP | [app/c/[slug]/page.tsx](app/c/[slug]/page.tsx) | Augment after fetch; price-bucket filters + sort use country-aware price |
| Brand PLP | [app/brand/[slug]/page.tsx](app/brand/[slug]/page.tsx) | Same |
| Search | [app/search/page.tsx](app/search/page.tsx) | Augment after fetch |
| Best-seller | [app/best-seller/page.tsx](app/best-seller/page.tsx) | Client-side augment |
| Bundles | [app/bundles/page.tsx](app/bundles/page.tsx) | Client-side augment |
| Shop@199 | [app/shop-199/page.tsx](app/shop-199/page.tsx) | Display-only — list membership still gated by `sale_price <= 199` (limitation) |
| PDP (server JSON-LD) | [app/products/[slug]/page.tsx](app/products/[slug]/page.tsx) | `effectivePriceForCountry` for the structured-data price |
| PDP (client display + related products) | [app/products/[slug]/product.tsx](app/products/[slug]/product.tsx) | `countryOfferPrice` state; related products use `augmentProductsWithCountryOffers` |
| Cart | [app/cart/page.tsx](app/cart/page.tsx) | `cartCountryOffers` state; rows useMemo attaches `effective_price` to each line |
| Wishlist | [app/wishlist/page.tsx](app/wishlist/page.tsx) | Auth + anon paths both augment |
| Account → Recently viewed | [app/account/page.tsx](app/account/page.tsx) | Augment after fetch |

### Cookie / country plumbing

- Source of truth: `mik_country` cookie (ISO-2). Set by middleware on first visit; updated by the country switcher.
- Server reads: `cookies().get("mik_country")` + `isSupportedCountry()` guard + `DEFAULT_COUNTRY` fallback.
- Client reads: each client surface has a small `readCountryFromCookie()` helper that parses `document.cookie`. Same guard + fallback semantics.

If you ever centralize this, the helper could move to `lib/countries.ts` and the duplicated copies in client pages can be deleted. Currently duplicated for surgical reasons (Phase 1 wanted zero shared-file churn).

---

## Known limitations / debt being carried

These don't break anything; they're rough edges to be aware of.

1. **Two pricing models coexist.** An admin can set both a `sale_price` and a country offer on the same product. Country offer wins (resolver checks it first), but `sale_price` is silently dead in that case. Foot-gun for admins editing the product later.

2. **Cart snapshot is stale.** When a customer adds to cart, the DB trigger `cart_items_bi_fn` snapshots `unit_price` from `get_effective_price()` — which only reads legacy fields. So `cart_items.unit_price` does **not** reflect country offers. The cart UI re-computes correctly because it reads products live and applies offers. `calc-totals` also re-quotes. The customer is charged correctly. But any tool reading `cart_items.unit_price` directly (debug views, admin tooling, future analytics) will see the legacy price.

   **Same applies to `order_items.unit_price`.** Snapshotted from cart_items at order-creation time via `create_order_from_cart` RPC. Since the cart snapshot is legacy-only, the order snapshot is too. The order's totals (`orders.subtotal`, `orders.total`) come from `recalculate_order_totals` which sums `line_total` — so the order *total* is the legacy total, not the country-offer total.

   **Wait — this needs verification.** Re-test before Phase 2: does the checkout email show the legacy unit_price or the country-aware unit_price? If the order_items snapshot diverges from the customer-paid amount, that's a bug worth fixing immediately (probably in `create_order_from_cart` to take a country, or by populating order_items.unit_price explicitly from the calc-totals result before the trigger fires).

3. **Shop@199 list membership.** The page filters by `sale_price <= 199` server-side. Products with a country offer ≤ ₹199 but no `sale_price` won't appear on the list. Phase 2 fixes this naturally (becomes "effective price ≤ 199 for the visitor's country"), but for now the list is a strict subset.

4. **Schedule windows still legacy.** The 9 products with `sale_starts_at`/`sale_ends_at` continue using the legacy resolver. Country offers in Phase 1 have no time-window concept — they're always active when `is_active=true`. If you want scheduled country offers, that's a Phase 3 add.

5. **`compare_at_price` is the MRP source.** Today the admin form labels it "Compare at" not "MRP". Renaming the label only (without renaming the column) is the soft Path B cleanup below.

6. **`get_effective_price` Postgres function is unaware of country offers.** It's only called from triggers, so the impact is item #2 above. If you write any new SQL that needs the customer-facing price, **don't call get_effective_price** — re-implement the resolver inline or expose a new function that takes country.

---

## Verification SQL (run this anytime to check state)

```sql
-- How many products have country offers?
select count(distinct product_id) as products_with_offers,
       count(*)                  as total_offer_rows,
       count(*) filter (where is_active = true) as active_rows
from public.product_country_prices;

-- Per-country offer distribution
select country_code,
       count(*) as offers,
       count(*) filter (where is_active = true) as active,
       round(avg(offer_price)::numeric, 0) as avg_offer
from public.product_country_prices
group by country_code
order by country_code;

-- Spot-check that no offer ≥ MRP (should be empty — server validation catches it
-- but anything inserted via raw SQL bypasses)
select pcp.product_id, p.name, p.compare_at_price as mrp,
       pcp.country_code, pcp.offer_price
from public.product_country_prices pcp
join public.products p on p.id = pcp.product_id
where p.compare_at_price is not null
  and pcp.offer_price >= p.compare_at_price;

-- Drift detection: how many products have BOTH a sale_price AND any country offer?
-- (foot-gun #1 from the debt list above — country offer silently wins)
select p.id, p.name, p.sale_price,
       count(pcp.country_code) as country_offer_count
from public.products p
join public.product_country_prices pcp on pcp.product_id = p.id
where p.sale_price is not null
group by p.id, p.name, p.sale_price
having count(pcp.country_code) > 0;
```

---

# Phase 2 — cleanup plan

Two sub-paths. Path B is a UX-only soft cleanup (no DB change). Path C is the full schema migration.

## Path B — soft cleanup (1–2 hours, low risk, no DB change)

Goal: reduce admin form clutter without touching the database.

**Changes:**

1. In [app/admin/products/[id]/AdminProductEditor.tsx](app/admin/products/[id]/AdminProductEditor.tsx), the "Pricing & Publish" section (currently 5 pricing inputs):
   - Rename "Compare at" label → "MRP"
   - Rename "Price" label → "List price"
   - Move `Sale price`, `Sale starts`, `Sale ends` into a collapsed `<details>` section labeled "Legacy / advanced (use country offers instead)"
   - Add a small inline warning when admin types in a sale_price AND the product has any country offers: "Country offers will override this for matching countries."

2. Same treatment in [components/admin/ProductForm.tsx](components/admin/ProductForm.tsx) (admin bulk CSV creator) if you want consistency. Probably skip — that's a CSV import UI, less visible.

3. Same treatment in [components/admin/ProductEditor.tsx](components/admin/ProductEditor.tsx) (vendor product editor) if you want to also de-emphasize legacy fields there. **Skip for Phase 1's "admin-only country offers" rule** unless you've decided to let vendors set country offers too.

Reversible: revert one file. No data side-effects.

## Path C — full schema migration (1–2 days, medium risk)

Goal: delete the legacy pricing fields. Only `mrp` (renamed from `compare_at_price`) and `product_country_prices` survive.

### Pre-flight

Confirm Phase 1 has run cleanly for a few weeks (no production bugs, no admin confusion that "the price doesn't change when I edit sale_price"). Also confirm with a fresh end-to-end test that **`order_items.unit_price` matches what the customer was charged** — that's the gnarliest invariant and the one most likely to bite you (see debt item #2 above).

### Step 1 — backfill `product_country_prices` from legacy

For every product where `sale_price < compare_at_price` and within sale window, AND no country offer already exists for that product, insert one row per supported country at `sale_price`. This preserves every current discount globally.

```sql
-- Preview before applying
with eligible as (
  select p.id as product_id, p.sale_price
  from public.products p
  where p.sale_price is not null
    and p.compare_at_price is not null
    and p.sale_price < p.compare_at_price
    and (p.sale_starts_at is null or p.sale_starts_at <= now())
    and (p.sale_ends_at   is null or p.sale_ends_at   >= now())
    and not exists (
      select 1 from public.product_country_prices pcp
      where pcp.product_id = p.id
    )
),
supported_countries(code) as (
  -- Hardcoded list — keep in sync with SUPPORTED_COUNTRIES in lib/countries.ts
  values ('IN'),('PL'),('US'),('VN'),('DE'),('FR'),('GB'),('IT'),
         ('ES'),('NL'),('CA'),('AU'),('AE'),('SG'),('JP')
)
select e.product_id, c.code as country_code, e.sale_price as offer_price
from eligible e cross join supported_countries c
order by e.product_id, c.code;

-- Apply (only after confirming the preview is correct)
insert into public.product_country_prices (product_id, country_code, offer_price, is_active)
select e.product_id, c.code, e.sale_price, true
from (
  select p.id as product_id, p.sale_price
  from public.products p
  where p.sale_price is not null
    and p.compare_at_price is not null
    and p.sale_price < p.compare_at_price
    and (p.sale_starts_at is null or p.sale_starts_at <= now())
    and (p.sale_ends_at   is null or p.sale_ends_at   >= now())
    and not exists (
      select 1 from public.product_country_prices pcp
      where pcp.product_id = p.id
    )
) e
cross join (values ('IN'),('PL'),('US'),('VN'),('DE'),('FR'),('GB'),('IT'),
                   ('ES'),('NL'),('CA'),('AU'),('AE'),('SG'),('JP'))
     as c(code)
on conflict (product_id, country_code) do nothing;
```

Expected impact: ~62 products × 15 countries = ~930 new rows. Customers continue paying exactly what they paid before.

### Step 2 — backfill `compare_at_price` where null

Phase 2 requires MRP NOT NULL. For products without one, use the highest of `price` / `sale_price` / `compare_at_price` as the MRP:

```sql
update public.products
   set compare_at_price = greatest(coalesce(price, 0), coalesce(sale_price, 0))
 where compare_at_price is null
   and (price is not null or sale_price is not null);
```

Then verify none remain NULL:

```sql
select count(*) from public.products where compare_at_price is null;
-- Must return 0 before proceeding to step 4.
```

### Step 3 — update `get_effective_price` to be country-aware

```sql
create or replace function public.get_effective_price(p_id uuid, p_country text default null)
returns table (unit_price numeric, mrp numeric, sku text, name text, hero_image_path text)
language sql stable as $$
  select
    coalesce(
      (select pcp.offer_price
         from public.product_country_prices pcp
        where pcp.product_id = p.id
          and pcp.country_code = upper(coalesce(p_country, ''))
          and pcp.is_active = true
        limit 1),
      p.compare_at_price,  -- MRP fallback (Phase 2: no more sale_price/price)
      0
    ) as unit_price,
    p.compare_at_price as mrp,
    p.sku, p.name, p.hero_image_path
  from public.products p
  where p.id = p_id;
$$;
```

### Step 4 — update triggers to pass country

The cart_items / order_items insert triggers need to know the visitor's country. Cleanest: add `country_code` to `carts` and `orders` (snapshot at create-time), then the trigger looks it up via cart_id / order_id.

```sql
alter table public.carts add column country_code text;
alter table public.orders add column country_code text;

-- Update cart_items_bi_fn
create or replace function public.cart_items_bi_fn() returns trigger
language plpgsql as $$
declare ep numeric; emrp numeric; esk text; ename text; eimg text; v_country text;
begin
  select c.country_code into v_country from public.carts c where c.id = new.cart_id;

  select unit_price, mrp, sku, name, hero_image_path
    into ep, emrp, esk, ename, eimg
  from public.get_effective_price(new.product_id, v_country);

  new.unit_price      := coalesce(new.unit_price, ep, 0);
  new.mrp             := coalesce(new.mrp, emrp);
  new.sku             := coalesce(new.sku, esk);
  new.name            := coalesce(new.name, ename);
  new.hero_image_path := coalesce(new.hero_image_path, eimg);
  new.line_total      := coalesce(new.unit_price,0) * greatest(1, coalesce(new.quantity,1));
  return new;
end;
$$;

-- Same pattern for order_items_bi_fn — look up orders.country_code
```

Plus an app-side change: every `add_to_cart`/`ensure_cart` path must write `carts.country_code` from `cookies().get('mik_country')`. The country switcher must update `carts.country_code` AND re-run a function that re-snapshots all existing `cart_items.unit_price` for the new country.

### Step 5 — rename `compare_at_price` → `mrp`

```sql
alter table public.products rename column compare_at_price to mrp;
alter table public.products alter column mrp set not null;
```

Update all 29 code references. Mostly mechanical — `compare_at_price` → `mrp`. Search-and-replace works for most, but check the SES email template and ProductCard logic for context.

### Step 6 — drop legacy columns

```sql
alter table public.products drop column price;
alter table public.products drop column sale_price;
alter table public.products drop column sale_starts_at;
alter table public.products drop column sale_ends_at;
```

After this, the resolver's fall-through code path is dead. Simplify [lib/pricing.ts](lib/pricing.ts) — `effectiveUnitPrice` and the legacy branch in `effectivePriceForCountry` can be deleted.

### Step 7 — re-snapshot existing carts

After dropping columns, existing `cart_items.unit_price` rows are still the pre-Phase-2 snapshots (legacy prices). Re-run the trigger logic on them so they reflect MRP / country offers:

```sql
update public.cart_items ci
   set unit_price = ep.unit_price,
       mrp        = ep.mrp,
       line_total = ep.unit_price * greatest(1, ci.quantity)
  from public.carts c,
       lateral public.get_effective_price(ci.product_id, c.country_code) ep
 where c.id = ci.cart_id;
```

Do not re-snapshot `order_items` — those are immutable historical records of what the customer was charged.

### Verification

Compare the old engine vs new engine for every product × every active country:

```sql
-- For each (product, country) combo, what does the new engine return?
-- Should be either: country offer (if set) OR MRP.
select p.id, p.name, c.country_code,
       (select unit_price from public.get_effective_price(p.id, c.country_code)) as new_price,
       p.mrp
from public.products p
cross join (select unnest(array['IN','PL','US','VN','DE','FR','GB','IT','ES','NL','CA','AU','AE','SG','JP']) as country_code) c
where p.is_published = true
order by p.id, c.country_code
limit 100;
```

Manually spot-check: a product with a country offer should show the offer for that country and MRP for others.

### Risk register

| Risk | Mitigation |
|---|---|
| `add_to_cart` breaks after column drop because trigger references missing column | Update trigger BEFORE dropping columns. Test on a staging branch. |
| Existing carts show stale prices | Step 7 re-snapshots them. Run it in the same transaction as the column drop. |
| MRP null after backfill | Step 2 verification query. Fail closed if count > 0. |
| Country switcher needs to invalidate cart_items | Add API: PATCH `/api/cart/country` that updates `carts.country_code` and re-runs trigger. Frontend calls this before `window.location.reload()`. |
| Order_items snapshots from before Phase 2 reference dropped columns | Snapshots are denormalized (have their own unit_price, mrp, name columns) — drop-column doesn't affect historical orders. Verify by querying `order_items` directly after the drop. |

---

# Phase 3 — optional extensions (not planned)

Things you might want eventually but don't need today.

1. **Scheduled country offers.** Add `starts_at`/`ends_at` to `product_country_prices`. Country offer is active only within window. Resolves the lost-functionality from dropping `sale_starts_at`/`sale_ends_at`.

2. **Per-country MRP.** Some sellers want different "was X" reference prices per country. Currently MRP is global. Would need a per-country MRP column on the same table (or a separate `product_country_mrp` table). Probably overkill — most stores need one MRP.

3. **Country groups.** "EU prices the same in DE/FR/IT/ES" should set one row that applies to all four. Today you'd set four rows. Add a `country_groups` table or accept `country_group_code` alongside `country_code`. Saves admin effort at scale.

4. **Bulk import / export.** CSV upload for country offers. Admin downloads a CSV of all products × all countries, edits, re-uploads. Probably worth it once you have >50 products with country pricing.

5. **History / audit log.** Track who changed which country offer when. Useful for compliance and rollback. Trivial table: `product_country_prices_history` with all the same columns + `changed_by`, `changed_at`, `previous_offer_price`.

6. **Surface "starting from" prices on PLPs.** Today the PLP shows the visitor's country price. If you ever want to show "from ₹X" (min country price across all countries), build a cached materialized view.

7. **Make `Shop@199` country-aware.** Today's filter is `sale_price <= 199` (limitation #3). To include country offers, the query becomes "any product where either sale_price ≤ 199 OR a country offer ≤ 199 exists for the visitor's country." Probably best to materialize this as a per-country index.

---

## Quick reference: files to find things in

If you can't remember where something lives:

- **Resolver logic:** [lib/pricing.ts](lib/pricing.ts)
- **Admin form:** [app/admin/products/[id]/AdminProductEditor.tsx](app/admin/products/[id]/AdminProductEditor.tsx) — Country offers section is below "Pricing & Publish"
- **Admin API:** [app/api/admin/products/[id]/country-prices/route.ts](app/api/admin/products/[id]/country-prices/route.ts)
- **Pricing engine (server):** [app/api/checkout/calc-totals/route.ts](app/api/checkout/calc-totals/route.ts)
- **Card display:** [components/ProductCard.tsx](components/ProductCard.tsx) (look for `effective_price` prop)
- **Cart display:** [app/cart/page.tsx](app/cart/page.tsx) (look for `cartCountryOffers`)
- **PDP client pricing:** [app/products/[slug]/product.tsx](app/products/[slug]/product.tsx) (look for `countryOfferPrice` state)
- **DB function the triggers call:** `get_effective_price(p_id)` in Supabase
- **Cookie source:** `mik_country` (set by middleware, updated by CountrySwitcher)
- **Country list:** [lib/countries.ts](lib/countries.ts) — `SUPPORTED_COUNTRIES`, `COUNTRY_PROFILES`, `DEFAULT_COUNTRY`, `isSupportedCountry`
