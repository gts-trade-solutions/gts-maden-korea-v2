# "Discover" Bento Grid — Optimization Backlog

> Status: draft for stakeholder review · created 2026-04-26
>
> Use this document to triage Discover follow-up work. Each gap has a
> short description, the proposed fix, and a priority hint. Strike items
> through (or move them to a "Done" section at the bottom) as they ship.
>
> Scope: all gaps below apply to the v1 Discover feature shipped on
> 2026-04-26 (table `product_story_blocks`, bucket `product-story-media`,
> storefront `ProductStorySection`, editor `ProductStoryEditor`).

> **Related document — [ISSUE_REGISTER.md](ISSUE_REGISTER.md)**
>
> App-wide audit findings (cart links, RLS, fake pincodes, etc.) live in
> the Issue Register and use a different ID convention: `C-01`, `M-08`,
> `N-13` (Critical / Moderate / Minor, hyphenated, zero-padded). This
> backlog uses `DISC-A1` … `DISC-H4` so the two ID spaces never collide.
> If a Discover item also affects the broader app, mention it here and
> add a cross-link from the Issue Register.

---

## Priority key

- **P0** — launch blocker or broken end-user experience
- **P1** — significant UX / perf / SEO win, fix soon
- **P2** — polish, scale-out concerns, nice-to-have
- **P3** — defer to v2 unless someone has free time

---

## DISC-A. Top priorities (do these first)

### DISC-A1. Author cannot preview the full bento grid · ✅ DONE 2026-04-27

> Resolved by the `<PreviewPane>` + `<GridPreview>` work in
> [components/admin/ProductStoryEditor.tsx](components/admin/ProductStoryEditor.tsx).
> The editor now offers two toggles above the preview frame:
>
> - **Tile / Full grid** — full grid renders every block in the same
>   layout the storefront uses, with the currently-selected tile
>   outlined in the primary ring.
> - **Desktop / Mobile** — switches the preview width (1200 px ↔ 375 px).
>   Mobile mode uses inline grid styles to force single-column at any
>   container size (Tailwind responsive classes key off viewport, so
>   container-relative previewing needs explicit styles).

**Original problem:** the editor only renders the currently-selected
tile in a 600 px-wide preview frame. The author never sees how the
tiles fit together at storefront sizes, or whether the layout reads
correctly when multiple sizes are mixed.

---

### DISC-A2. Storefront tiles should expand on click · ✅ DONE 2026-04-27

> Resolved by
> [components/products/StoryTileExpanded.tsx](components/products/StoryTileExpanded.tsx)
> + a new `onExpand` prop on `<StoryTile>` that turns the tile into a
> focusable `<button>` with `aria-label`. `<ProductStorySection>` owns
> the open-block state and renders the lightbox.
>
> - Built on shadcn `Dialog`, so focus trap, ESC, and overlay-click are
>   inherited.
> - `<StoryTileExpanded>` ships with type-aware bodies for hero /
>   feature, image, stats, and comparison; each uses a "bumped"
>   typographic scale that's one step larger than the in-grid size.
> - URL routing was deferred (option (a) per review) — modal state is
>   local React state. Browser back-button does not close the lightbox;
>   ESC and overlay click do.
>
> Open follow-ups:
> - Comparison slider keyboard control inside the lightbox is still
>   tracked under DISC-F3.

**Original problem:** every tile is static. Customers see whatever
fits in the grid cell — long body text gets clipped on small sizes,
comparison sliders are hard to read at `1x1`, and stats numbers are
cramped on narrow tiles.

---

### DISC-A3. Text size, position, and color should be customizable on every text-bearing block · ✅ DONE 2026-04-27

> Resolved by:
>
> - Migration `add_psb_text_size` (live as of 2026-04-27 on project
>   `bjudxntmpfpbyloibloc`) — adds `text_size text default 'md' check
>   (text_size in ('sm','md','lg','xl','2xl'))`.
> - Local file
>   [supabase/migrations/20260427_add_psb_text_size.sql](supabase/migrations/20260427_add_psb_text_size.sql).
> - `TextSize` union + `TEXT_SIZES` constant added to
>   [lib/types/productStory.ts](lib/types/productStory.ts).
> - [components/products/StoryTile.tsx](components/products/StoryTile.tsx)
>   rewritten with unified type-scale helpers (`headlineClass`,
>   `bodyClass`, `captionClass`, `statValueClass`, `statLabelClass`)
>   driven by `text_size`. `text_position` now drives alignment for
>   non-overlay scopes (image caption, stats, comparison caption).
>   `text_color` drives text shade everywhere; in non-overlay scopes
>   (feature Mode B text half, stats, captions) it also picks an
>   appropriate background tint so the contrast stays readable.
> - [components/admin/ProductStoryEditor.tsx](components/admin/ProductStoryEditor.tsx)
>   ships a new `<TextStyleControls>` component (color / size /
>   position) that's now rendered for **every** text-bearing block:
>   hero, feature (both A and B), image, stats, comparison. Each call
>   passes a `note` prop so the panel labels what the controls affect
>   in that context.
> - Defaults: new hero blocks save with `text_size = 'xl'`, every
>   other block defaults to `'md'`. Existing rows received `'md'` from
>   the migration default — visual output is unchanged from v1.
>
> Out of scope by design (still): font family, font weight, line
> height, custom hex colors. v2 candidates if anyone asks.

**Original state (now fixed):**

| Block type | Headline | Body | Position | Color | Size |
|---|---|---|---|---|---|
| `hero` (Mode A) | ✓ | ✓ | ✓ (Mode A only) | ✓ (Mode A only) | hardcoded |
| `feature` (Mode A) | ✓ | ✓ | ✓ | ✓ | hardcoded |
| `feature` (Mode B) | ✓ | ✓ | n/a (split layout) | n/a | hardcoded |
| `image` | caption only | – | – | – | hardcoded |
| `stats` | ✓ (optional) | – | – | – | hardcoded |
| `comparison` | – | – | – | – | hardcoded |

**Problems:**

- `text_position` and `text_color` columns exist in the DB but the
  editor only surfaces them for `hero`/`feature` Mode A.
- There is no `text_size` column at all; sizes are encoded in the
  renderer's Tailwind classes.
- Stats headlines, image captions, and comparison captions are
  effectively un-stylable.

**Proposed:**

1. Add a new column `text_size text default 'md' check (text_size in
   ('sm','md','lg','xl','2xl'))`.
2. Promote `text_position`, `text_color`, and `text_size` to "common
   text controls" exposed for **every** block type that has any text:
   - `hero` and `feature` Mode A — controls apply to the headline+body
     overlay (already supported, just needs `text_size` added).
   - `feature` Mode B — controls apply to the text half (currently fixed
     `bg-card` styling).
   - `image` — controls apply to the caption.
   - `stats` — controls apply to the headline (and optionally the
     value/label rendering).
   - `comparison` — controls apply to the caption.
3. Update `<StoryTile>` to read the three columns uniformly and apply
   them via a single helper (`textStyleFor(block)`) instead of
   per-variant hardcoding.
4. Decide a sane default per block type so existing rows render the
   same as today (no migration data backfill needed).

**Out of scope for this gap:** font family, font weight, line-height,
custom hex colors. Stick to the predefined size/position/color
vocabulary.

---

### DISC-A4. Move the data fetch to the server · ✅ DONE 2026-04-27

> Resolved by:
>
> - New `getStoryBlocksForProduct()` cached server fetch in
>   [app/products/[slug]/page.tsx](app/products/[slug]/page.tsx),
>   wrapped in `unstable_cache` with `revalidate: 300` and a
>   `'story-blocks'` cache tag.
> - Defensive fallback: if the SELECT errors with "text_size column
>   does not exist", the fetch retries without that column. Belt-and-
>   braces for any environment that's behind on migrations.
> - `<ProductPage>` now accepts an optional `initialStoryBlocks`
>   prop and threads it to `<ProductStorySection initialBlocks={...} />`.
> - `<ProductStorySection>` skips its own client fetch when
>   `initialBlocks` is provided, so the section is fully server-
>   rendered, SEO-visible, and only causes a single client roundtrip
>   if for some reason the section is mounted without server data.

**Original problem:** `ProductStorySection` was `"use client"` and
fetched in `useEffect`. Search engines and social-link previews saw
no Discover content. Every page view cost an extra round-trip.

---

### DISC-A5. Skip the skeleton flash for products with no Discover content · ✅ DONE 2026-04-27

> Resolved alongside DISC-A4. `<ProductStorySection>` now returns `null`
> during loading; it only renders the heading + grid once it knows the
> blocks list is non-empty. With server-side fetch in place the
> loading state effectively never fires for SSR'd page loads. The
> `<ProductStorySectionSkeleton>` export is kept for callers that
> *know* they have content (e.g. live preview frames that want a
> placeholder during slow image loads).

**Original problem:** every product page rendered `<DISC-H2>Discover</DISC-H2>`
plus three skeleton tiles for ~500 ms while the fetch resolved, then
collapsed to `null` if the product had no blocks. Today that's ~99 %
of products.

---

### DISC-A6. Image transformation (WebP/AVIF, width-aware) · ✅ FOLDED INTO DISC-B2 2026-04-27

> On review, Next.js's built-in `<Image>` already routes the project's
> Supabase URLs through `/_next/image`, which handles AVIF/WebP
> negotiation and width-aware variants for free (the project's
> `images.remotePatterns` config in [next.config.js](next.config.js)
> covers the bucket host). The remaining gap was the `sizes` attribute
> reporting full-viewport widths instead of the actual grid cell
> width inside `max-w-screen-xl`.
>
> Fixed alongside the StoryTile rewrite — `imageSizesForSize()` now
> reports container-relative widths (`(min-width: 1280px) 320px /
> 640px / 1280px`), so Next requests appropriately-sized variants on
> wide screens. The Supabase render endpoint can still be revisited if
> we ever want to bypass `_next/image` for cost reasons; tracking that
> conversation under DISC-B2.

**Original problem:** uploaded images appeared to be served at full
upload size. Investigation showed Next.js was already optimizing them;
the real win was correcting the `sizes` attribute (now done).

---

### DISC-A7. Set `priority` on the LCP tile · ✅ DONE 2026-04-27

> Resolved by:
>
> - `<StoryTile>` now accepts a `priority?: boolean` prop and forwards
>   it to every internal `next/image` call (image block, hero/feature
>   modes A and B, comparison fallback). When `priority` is true,
>   `fetchPriority="high"` is also applied.
> - `<ProductStorySection>` passes `priority={idx === 0}` to the first
>   tile in the grid, so whatever block leads the section gets the
>   LCP boost.

**Original problem:** no tile got `priority` or `fetchPriority="high"`.
The first tile on long product pages was usually the LCP element, but
Next deferred loading.

---

### DISC-A8. Make reorder atomic · **P1**

**Current:** N parallel UPDATEs. If the tab closes mid-flight, some
blocks have new positions and others don't. Acceptable today
(no unique constraint, ordering still works) but messy.

**Proposed:** add a SQL function `update_psb_positions(ids uuid[],
positions int[])` that runs both updates inside a transaction; call it
via `supabase.rpc(...)` from the editor.

---

## DISC-B. Performance & SEO

### DISC-B1. No caching layer · P1

Same product viewed 10 times = 10 Supabase queries. Add `revalidate` on
the RSC fetch, or wrap behind a route handler with HTTP caching.

### DISC-B2. `sizes` attributes assume `md` ≈ desktop · ✅ DONE 2026-04-27

> Fixed in
> [components/products/StoryTile.tsx](components/products/StoryTile.tsx)
> alongside DISC-A6. `imageSizesForSize()` now reports container-relative
> widths (`(min-width: 1280px) 320px / 640px / 1280px`) instead of
> viewport-relative ones, so Next downloads the right variant on wide
> screens.

**Original problem:** tiles reported `25vw / 50vw / 100vw`, but the
grid sits inside `max-w-screen-xl` (~1280 px). On a 4K viewport Next
downloaded larger images than the grid actually uses.

### DISC-B3. `md:auto-rows-[220px]` is a magic number · P2

Each cell ends up ~180 × 220 on a small `md` screen and ~280 × 220 on
a wide screen — different aspect ratios that don't match the
size hints. Move to ratio-based rows or `auto-rows-fr`.

### DISC-B4. No blur / dominant-color placeholder · P1

Hard pop-in on every tile. Capture a tiny base64 thumbnail at upload
time, store as `image_blur_data_url`, pass to `next/image`'s
`placeholder="blur"`.

### DISC-B5. `<StoryTile>` re-renders on every parent change · P2

Editor and storefront both re-render every tile on each state change.
Wrap with `React.memo` keyed on block id + `updated_at`.

### DISC-B6. No structured data (JSON-LD) · P2

Each tile is rich content. Emit `ImageObject` per image and a parent
`Article` for hero/feature blocks. Best done after DISC-A4.

---

## DISC-C. Image handling

### DISC-C1. Old image is never deleted on replace · P1

When a vendor uploads a replacement, the old object stays in storage
forever. Capture the previous `image_path` before update and queue a
`storage.remove()`. Same logic for `before_image_path` and
`after_image_path`.

### DISC-C2. No focal-point / cropping control · ✅ DONE 2026-04-27 (v2)

> Resolved by:
>
> - Migration `add_psb_focal_point` (live) adds nullable
>   `image_focal_x` and `image_focal_y` numeric columns (0–100,
>   percentage). Null = center default.
> - [components/admin/FocalPointPicker.tsx](components/admin/FocalPointPicker.tsx)
>   — hand-rolled draggable-dot picker that overlays the chosen
>   tile-size aspect rectangle on the image so the author sees what
>   `object-cover` will keep visible.
> - [components/products/StoryTile.tsx](components/products/StoryTile.tsx)
>   `<ImageOrPlaceholder>` now applies `objectPosition: '<x>% <y>%'`
>   from the focal point on every tile.
> - Editor exposes a "Set focal point" button next to the common
>   image; auto-resets when the image is replaced or removed.
> - Same focal point applies on mobile, which closes the
>   "subject crops on phones" complaint with no per-breakpoint
>   field.

**Original problem:** landscape image in a `1x2` (tall) tile got
centered and the subject clipped.

### DISC-C3. No upload progress UI · P2

Large file uploads block the form with no feedback. Add a progress
indicator using Supabase upload's progress callback.

### DISC-C4. No client-side resize / compression · P2

Vendors can upload 6000×4000 JPEGs at the 4 MB cap. Resize on the
client (canvas + `toBlob`) before upload to a max dimension like
2400 px.

### DISC-C5. Public bucket allows LIST · P2

The new `product-story-media` bucket inherits the broad SELECT pattern
used by the other buckets — anyone can list every uploaded file.
Tighten to read-by-name only (a project-wide cleanup, also flagged in
the security audit).

---

## DISC-D. Database & data integrity

### DISC-D1. `stats_items` is unconstrained JSONB · P2

A buggy client can write garbage. Add `CHECK (stats_items IS NULL OR
jsonb_typeof(stats_items) = 'array')` or move stats to a child table
`product_story_stats_items` with a foreign key.

### DISC-D2. No soft-delete / undo · P1

Delete is permanent. Add `deleted_at timestamptz` and a 30-day restore
window in admin.

### DISC-D3. No revision history · P2

A bad edit silently overwrites the previous good state. A
`product_story_block_revisions` audit table makes rollbacks trivial.

### DISC-D4. No publish/draft state per block · P3

Every saved block is live immediately. Authors can't stage redesigns.
Spec deferred this; flag for v2.

### DISC-D5. No max-blocks-per-product cap · P2

Theoretically a vendor could create thousands. Add a soft limit
(~30) with a friendly UI message.

### DISC-D6. `text_size` column does not exist · P0 (covered by DISC-A3)

See DISC-A3 above.

### DISC-D7. Reorder writes have no `position_updated_at` · P3

Minor. Only matters if the team needs to detect reorder events
specifically.

---

## DISC-E. Editor UX

### DISC-E1. Comparison block has 3 image pickers · P1

Common image picker + before + after. The common one is unused by the
renderer. Hide the common picker for `comparison` and `stats` block
types. Ditto the alt-text field that depends on it.

### DISC-E2. Size selector is an abstract dropdown · P2

"1x1 / 2x1 / 1x2 / 2x2 / 4x1" doesn't show authors what they'll get.
Replace with a 4×N visual grid of clickable size previews.

### DISC-E3. No mobile preview toggle · P2

Preview is fixed at 600 px. Authors can't see how their headline
wraps on a phone. Add a "Desktop / Mobile" toggle in the preview
frame. (Lighter version of DISC-A1.)

### DISC-E4. No "Use product hero image" shortcut · P2

The Discover hero is often the same as the product hero, which forces
authors to re-upload the same file. Pull from `product_images` with
one click.

### DISC-E5. No clone / duplicate block · P2

Building 5 similar feature blocks means filling the same form 5 times.
Add a "Duplicate" action.

### DISC-E6. No copy-from-another-product · P3

Vendors with similar products (same line, different variants) rebuild
the same Discover content from scratch.

### DISC-E7. Editor uses controlled inputs instead of `react-hook-form` · P3

Spec called for RHF + zod; we used direct controlled inputs and
`queuePatch`. Works, but no field-level validation, dirty-tracking, or
form-level error states. Either bring RHF in or document the
deviation.

### DISC-E8. Auto-save has no retry on transient errors · P2

Network blip → toast → user has to retype. Add retry-with-backoff and
a "X changes pending" indicator.

### DISC-E9. Two-pane layout stacks awkwardly on mobile · P2

On a phone with 10 blocks, the form is below the entire list. Make
the list collapsible or float the preview as sticky.

### DISC-E10. No keyboard-reorder hint · P3

dnd-kit's `KeyboardSensor` is wired up, but there's no visible cue
that focusing the drag handle and pressing Space starts a reorder.

---

## DISC-F. Storefront rendering polish

### DISC-F1. Hero "dark text on dark image" can fail contrast · 🟡 PARTIAL 2026-04-27 (v2)

> The v2 color picker now surfaces a live WCAG contrast badge
> (`AA ✓` / `AA ✗` with the numeric ratio) whenever both `text_color`
> and `text_bg` are hex values, and the AI text-color suggestions are
> ranked by contrast against the image's dominant color. Authors who
> read the badge will catch most failing combos.
>
> Still open: nothing **prevents** an author from saving a failing
> combo, and the badge doesn't show when one side is the legacy
> `light` / `dark` keyword. A v3 enhancement could block save or show
> a sticky banner when contrast falls below AA.

**Original problem:** authors could pick a combo that was unreadable
with no feedback.

### DISC-F2. Stats block uses plain `<div>`s · ✅ DONE 2026-04-27

> Fixed during the StoryTile rewrite — stats blocks (and their
> lightbox bumped variant) now use `<dl>` / `<dt>` / `<dd>` semantics
> for proper screen-reader pairing. Visual labels are duplicated as
> `aria-hidden` text under each value to preserve the layout.

### DISC-F3. Comparison slider has no keyboard control · ✅ DONE 2026-04-27 (v2)

> Fixed in
> [components/products/BeforeAfterSlider.tsx](components/products/BeforeAfterSlider.tsx):
> the slider container is now `tabIndex={0}` and handles ← / → (5 % step,
> 10 % with Shift held), Home (0 %), and End (100 %).

### DISC-F4. `alt` text not enforced before save · P1

Vendor can publish an image block with no alt — storefront renders
`alt=""`. Either block save or surface a "Missing alt" badge on the
list row.

### DISC-F5. Discover section is buried mid-page on mobile · P2

It sits between Additional Details and Reviews; many shoppers scroll
past. Consider promoting it to an entry in the existing product tabs
strip ("Story" / "Discover") so it's reachable in one tap.

### DISC-F6. Feature Mode B background is fixed `bg-card` · P2

No way to tint the text half. Adding a `text_bg` column or letting DISC-A3
text-color also drive a background tint would help.

---

## DISC-G. Accessibility

### DISC-G1. No `aria-live` on save status · P2

Screen readers don't hear "Saving / Saved" updates from the editor.

### DISC-G2. Pointer-capture region of comparison slider · P3

Vertically swiping near the slider edges may consume gestures intended
for page-scroll. Worth a touch-action review on mobile devices.

### DISC-G3. Section heading hierarchy · P3

Section uses `<DISC-H2>`. Inside the editor we use `<DISC-H3>` for "Blocks" and
"Preview" — verify with a heading audit that no level is skipped on
either page.

---

## DISC-H. Operations & maintenance

### DISC-H1. Orphan-image cleanup is fire-and-forget · P2

Failures only log to console. Add a weekly job (or a `to_delete`
table) that retries cleanup so storage doesn't accumulate.

### DISC-H2. No analytics on tile views/clicks · P2

We don't know which tiles convert, or whether the section moves the
needle. Spec excluded for v1; instrument early so we have data when we
review the feature in 30 days.

### DISC-H3. TypeScript errors are ignored at build time · P3

`next.config.js: ignoreBuildErrors: true`. Discover code is clean
today; nothing prevents future regressions. CI step that runs
`npm run typecheck` and fails on errors closes this loop.

### DISC-H4. RLS reliance for vendor scope · P3

Editor doesn't pre-check `profiles.role` or vendor approval; it relies
on RLS to reject writes. Works, but a UI-level check would surface the
error before the user fills in a long form.

---

## I. Already done in v1 (for reference, do not redo)

### v1 ship (2026-04-26)

- Migration applied; `product_story_blocks` table + RLS.
- `product-story-media` bucket created with public read and
  authenticated write.
- Storefront component with auto-hide on empty state.
- Editor with drag-reorder (atomic-fix pending — see DISC-A8), debounced
  auto-save, type-picker dialog, AlertDialog delete with best-effort
  storage cleanup.
- Tabs added to both admin and vendor product editors.
- Reorder bug fix (`product_id` NOT NULL + dropped
  `(product_id, position)` unique constraint + switched to N parallel
  UPDATEs).

### P0 follow-up batch (2026-04-27)

All seven Section A items closed in one pass, plus two opportunistic
pickups from sections B and F. Migration `add_psb_text_size` applied
live to project `bjudxntmpfpbyloibloc` and verified.

| ID | What changed | Where |
|---|---|---|
| DISC-A1 | Editor preview now has Tile / Full-grid toggle and Desktop / Mobile width switch; full-grid mode highlights selected tile | `components/admin/ProductStoryEditor.tsx` (`PreviewPane`, `GridPreview`) |
| DISC-A2 | Storefront tiles are clickable; new lightbox with type-aware bodies for hero/feature, image, stats, comparison | `components/products/StoryTileExpanded.tsx`; new `onExpand` prop on `<StoryTile>` |
| DISC-A3 | New `text_size` column + unified `<TextStyleControls>` rendered for every text-bearing block; `<StoryTile>` reads color/size/position uniformly across types | Migration `add_psb_text_size`; `lib/types/productStory.ts`; both StoryTile files; editor |
| DISC-A4 | Server-side `getStoryBlocksForProduct()` with `unstable_cache` + `revalidate: 300`; `initialBlocks` prop threaded through `<ProductPage>` | `app/products/[slug]/page.tsx`, `app/products/[slug]/product.tsx`, `<ProductStorySection>` |
| DISC-A5 | Loading state now returns `null`; skeleton flash gone | `<ProductStorySection>` |
| DISC-A6 | Folded into DISC-B2 — Next's image optimizer was already in play; the real fix was the `sizes` attribute | `<StoryTile>` `imageSizesForSize()` |
| DISC-A7 | First tile renders with `priority` + `fetchPriority="high"` | `<StoryTile>`, `<ProductStorySection>` |
| DISC-B2 | `sizes` now container-relative, accounting for `max-w-screen-xl` | `<StoryTile>` |
| DISC-F2 | Stats use `<dl>` / `<dt>` / `<dd>` for screen-reader pairing | `<StoryTile>` (and lightbox variant) |

Also picked up while in the area:

- Defensive fallback in `getStoryBlocksForProduct()` retries the SELECT
  without `text_size` if the column is missing (safety net for any
  environment behind on migrations).
- New blocks now save a sensible default `text_size` (`'xl'` for hero,
  `'md'` for the rest).
- Stats lightbox uses a "bumped" type scale one step larger than the
  in-grid stats variant.

Quality gates: `npm run typecheck` and `npm run lint` introduced no new
errors or warnings on any file created or modified for this batch.
Three pre-existing errors remain in `app/products/[slug]/page.tsx` and
`product.tsx` (Supabase brand-join inference and `Review.photos`),
unchanged from v1 ship.

### Discover v2 batch (2026-04-27, second pass)

Triggered by live testing: the lightbox didn't fill the viewport for
several tile types, the comparison tile auto-expanded on every drag,
mobile crops were unmanageable, and authors wanted full-spectrum text
colors plus help picking a readable shade. Three tracks shipped in one
pass; two new migrations applied live to project
`bjudxntmpfpbyloibloc`.

#### Track 1 — Lightbox rewrite + comparison Expand button

| What | Where |
|---|---|
| Replaced shadcn `<DialogContent>` wrapper with Radix Dialog primitives so the lightbox occupies the full viewport (`fixed inset-0`) and uses `min-h-0 flex-1` plumbing for explicit body heights. Hero / Feature, Image, Stats, Comparison each render in dedicated layouts that no longer collapse to "thin lines". | `components/products/StoryTileExpanded.tsx` (rewritten) |
| Comparison tile no longer auto-expands on drag. Whole-tile click handler is gone; a small "Expand" button (Lucide `Maximize2`) overlays the top-right and is the only path into the lightbox. Slider drag works as before in the grid view. | `components/products/StoryTile.tsx` |
| Slider keyboard control: ← / → nudge by 5 % (10 % with Shift), Home / End jump to 0 / 100. Container is `tabIndex={0}` with focus-visible ring. Closes DISC-F3. | `components/products/BeforeAfterSlider.tsx` |
| Headers are minimal so the image / slider gets the most real estate; lightbox uses `object-contain` on a black backdrop so portrait + landscape both look right. | `StoryTileExpanded` |

#### Track 2 — Smart upload (focal point + tile-size suggestion)

| What | Where |
|---|---|
| Migration `add_psb_focal_point` adds nullable `image_focal_x` / `image_focal_y` numeric columns (0–100). Storefront renderer applies them as `object-position`. | live migration; `lib/types/productStory.ts`; `<ImageOrPlaceholder>` in StoryTile |
| New `<FocalPointPicker>` opens via "Set focal point" button next to the common image. Hand-rolled — single draggable dot on the image with a translucent crop window that mirrors `object-cover` math at the chosen tile aspect ratio. "Reset to center" available. Focal-point auto-clears on image upload/remove so a stale point can't disfigure a new image. | `components/admin/FocalPointPicker.tsx`; `FocalPointButton` in editor |
| Tile-size suggestion: on upload the image's natural dimensions are read via an in-memory `Image` element. Aspect ratio is mapped to a recommended bento size (`<0.7 → 1x2`, `≤1.3 → 1x1`, `≤2.3 → 2x1`, `>2.3 → 4x1`). When it differs from the current size, sonner shows a non-blocking toast with an "Apply" action button. | `BlockForm` upload handler |
| Mobile cropping fix: focal point applies on every breakpoint, so the same author choice lands the subject correctly on phones. | renderer |

#### Track 3 — Free-form text colors + AI suggestion

| What | Where |
|---|---|
| Migration `relax_psb_text_color_and_add_text_bg` drops the `'light' / 'dark'` CHECK on `text_color` (column stays text), adds a nullable `text_bg` column. Renderer treats the legacy keywords as themed defaults and any other string as a CSS color. Existing rows render unchanged. | live migration; types updated; renderer applies inline `style={{ color }}` + `{ backgroundColor }` for non-keyword values |
| New `<ColorControl>` component: Light / Dark / Custom (and "None" for nullable backgrounds) segmented control. Custom mode opens a popover with `react-colorful`'s `HexColorPicker`, a hex input, and a 10-swatch preset grid. | `ColorControl` in editor |
| Two `<ColorControl>` instances per text-bearing block: one for `text_color`, one for `text_bg` (nullable). Available on every block type, replacing the old Light / Dark radio. | `TextStyleControls` in editor |
| New utility `lib/colorSuggester.ts`: pure client-side analyzer. Loads the image (CORS opportunistic), draws onto a 48×48 canvas, computes average luminance and a histogram-based dominant color, then returns up to 5 readable text-color suggestions ranked by WCAG contrast against the dominant color. | `lib/colorSuggester.ts` |
| "Suggest from image" button next to each color control runs `analyzeImageColor()` and surfaces suggestions as one-click swatches with their contrast ratio + AA badge. No API calls; no `OPENAI_API_KEY` use. | `ColorControl` |
| WCAG contrast badge (`AA ✓` / `AA ✗` with numeric ratio) appears whenever both `text_color` and `text_bg` are hex values. Fold-in for DISC-F1. | `ColorControl` |

#### Files touched (v2)

- `components/products/StoryTileExpanded.tsx` — full rewrite (Radix primitives)
- `components/products/StoryTile.tsx` — comparison Expand button, focal-point pass-through, free-form color rendering
- `components/products/BeforeAfterSlider.tsx` — keyboard support, focus ring
- `components/admin/ProductStoryEditor.tsx` — TextStyleControls upgraded, FocalPointButton, upload-time size suggestion, SELECT_COLUMNS expanded
- `components/admin/FocalPointPicker.tsx` (new)
- `lib/colorSuggester.ts` (new)
- `lib/types/productStory.ts` — `TextColor`, optional `text_bg`, `image_focal_x` / `image_focal_y`
- `app/products/[slug]/page.tsx` — STORY_SELECT_COLUMNS expanded
- `components/products/ProductStorySection.tsx` — SELECT_COLUMNS expanded
- `package.json` — `react-colorful` added
- Migrations applied live: `add_psb_focal_point`, `relax_psb_text_color_and_add_text_bg`, plus local files in `supabase/migrations/`

#### Quality gates

- `npm run typecheck`: zero new errors. Pre-existing errors (Review.photos, brands-join inference) unchanged.
- `npm run lint`: zero new findings on any v2 file.

### Discover v3 batch (2026-04-27, third pass)

Triggered by a second round of live testing: the autosave-only model
felt "invisible" and authors wanted a manual Save button, focal-point
alone couldn't fix tiles where the image was too small (no zoom), the
upload-time size suggestion was a fleeting toast, the contrast
suggestions only knew one strategy, and the grid sometimes left
visible empty cells. Five tracks shipped in one pass; one new
migration applied live to project `bjudxntmpfpbyloibloc`.

#### Track 1 — Manual Save model (coexists with autosave)

| What | Where |
|---|---|
| Per-block dirty tracking via a `dirtyIds: Set<string>` plus a `serverSnapshot: Record<id, StoryBlock>` of last-saved state. Populated on initial load, on add, on delete (with position repack), on reorder, and on every successful UPDATE. | `Editor` in ProductStoryEditor |
| New `saveNow()` flushes the pending patch immediately (cancels the 300 ms debounce). New `discardChanges(blockId?)` reverts the local state to the server snapshot for one block (or all dirty blocks) and clears the queue. | `Editor` |
| `<BlockForm>` header now shows: an "Unsaved changes" amber pill when dirty, a `Discard` ghost link, and a primary `Save changes` button (disabled while clean, becomes `Saving…`, `Saved`, or `Retry save (destructive)` based on state). | `BlockForm` |
| Window `beforeunload` listener registers whenever there are pending changes so closing the tab prompts the browser confirmation dialog. | `Editor` |

Autosave still runs on the existing 300 ms debounce — Track 1 just makes it visible and gives authors an explicit shortcut.

#### Track 2 — Image fit + zoom + per-tile background

| What | Where |
|---|---|
| Migration `add_psb_image_fit_zoom_bg` adds `image_fit text default 'cover' check ('cover','contain','fill','original')`, `image_zoom numeric default 1 check (1..3)`, and `image_bg text` (nullable). Every existing row gets `image_fit='cover', image_zoom=1`. | live migration; types + SELECTs updated everywhere |
| `<FocalPointPicker>` rewritten as `<ImageFitPicker>` (the old export name still works for back-compat). Adds a fit-mode segmented control on top, a zoom slider (1×–3×, 0.05× steps) when fit=cover, and a "Show advanced fits" toggle for `fill` / `original`. The crop preview rectangle now respects zoom by shrinking with `1/zoom`. | `components/admin/FocalPointPicker.tsx` |
| Renderer: `<ImageOrPlaceholder>` rewritten to take a `block` prop and apply: `object-fit` per `image_fit`; `transform: scale(image_zoom)` with `transform-origin` set to the focal point when fit=cover; `image_bg` applied as `background-color` on the image's clipping wrapper so contain/fill leave a coloured backdrop, not the tile's `bg-card`. | `components/products/StoryTile.tsx` |
| Editor exposes a third `<ColorControl>` (Image background) — only renders when fit ≠ cover. Reuses the same Light/Dark/Custom/None segmented picker, swatch palette, hex input, and "Suggest from image" button. | `BlockForm` in editor |
| Replacing the image clears focal/zoom/fit/bg back to defaults so a fresh upload doesn't inherit a stale crop. Removing it also clears `image_bg`. | `BlockForm` upload handler |

#### Track 3 — Persistent recommended-size indicator

| What | Where |
|---|---|
| New `<RecommendedSize>` component lives below the image picker. It loads the image's natural dimensions on mount/when the source changes and renders a green "✓ Tile size matches" pill or an amber "Image is X:Y. Recommended SIZE" pill with an Apply button. Has an inline `ⓘ` tooltip explaining the aspect-ratio rule. | `RecommendedSize` in editor |
| Upload-time toast removed — the persistent indicator covers the same case and stays visible while the author tweaks size manually. | `BlockForm` upload handler |

#### Track 4 — Color suggestion knobs

| What | Where |
|---|---|
| `analyzeImageColor(url, options)` now accepts `{ mode: 'best-contrast' \| 'match-dominant', aaOnly: boolean }`. New helpers `rgbToHsl` / `hslToRgb` / `variationsAroundHex` synthesise five lightness-graded variations of the dominant color for the match-dominant mode. AA-only filter falls back to the unfiltered top 5 when nothing passes, so the user never sees an empty result. | `lib/colorSuggester.ts` |
| Suggestions panel inside `<ColorControl>` gained: a `Best contrast / Match dominant` segmented control, an `AA only` checkbox, and an `ⓘ` tooltip that explains the algorithm in one sentence. Toggling either control re-runs `analyzeImageColor` immediately. | `ColorControl` in editor |

#### Track 5 — Grid health + Tidy

| What | Where |
|---|---|
| New `lib/gridPacker.ts` — pure module with `packBlocks(sizes, cols=4)` (left-to-right top-to-bottom simulation that returns placements + empty-cell count) and `tidyOrder(blocks, cols=4)` (tries original / largest-area-first / tallest-first / widest-first orderings and returns the best). Stable and side-effect-free. | `lib/gridPacker.ts` |
| `<GridHealth>` strip renders inside the editor's full-grid preview pane. Shows ✓ when the grid fills cleanly, an "N empty cells across M rows" message otherwise, plus a `Tidy grid (would save N cells)` button when a better ordering exists. Clicking the button reorders blocks via parallel UPDATEs (same path as drag-reorder) and toasts success. | `GridHealth` in editor |
| `applyTidyOrder(orderedIds)` on the Editor reorders blocks, updates `serverSnapshot`, and persists positions in parallel. | `Editor` |

#### Files touched (v3)

- New: `lib/gridPacker.ts`
- Modified: `lib/colorSuggester.ts` (HSL helpers, mode + aaOnly options)
- Modified: `lib/types/productStory.ts` (`ImageFit`, `IMAGE_FITS`, `image_fit`/`image_zoom`/`image_bg` on `StoryBlock`)
- Modified: `components/products/StoryTile.tsx` (renderer support for fit/zoom/bg + `<ImageOrPlaceholder>` rewrite)
- Rewritten: `components/admin/FocalPointPicker.tsx` (now `<ImageFitPicker>` internally)
- Modified: `components/admin/ProductStoryEditor.tsx` (save model, RecommendedSize, image-bg ColorControl, suggestion knobs, GridHealth, applyTidyOrder)
- Modified: `components/products/ProductStorySection.tsx`, `app/products/[slug]/page.tsx` (SELECT_COLUMNS expanded again)
- New migration: `supabase/migrations/20260427_add_psb_image_fit_zoom_bg.sql`

#### Quality gates

- `npm run typecheck`: zero new errors. The pre-existing 6-error baseline (`Review.photos`, brands-join inference) is unchanged.
- `npm run lint`: zero new errors/warnings on any v3 file.

#### Backlog items affected

- **DISC-C2** (focal-point) — already done in v2; v3 expanded the same picker into a fuller `<ImageFitPicker>` with fit modes + zoom + bg color. Stays done.
- **DISC-F1** (dark-on-dark contrast) — was 🟡 PARTIAL after v2's contrast badge. v3 adds suggestion knobs and an AA-only filter, which makes finding a passing combo much easier, but **does not block save on AA failure**. Status remains PARTIAL with a v4 candidate to enforce AA.

### Discover v4 batch (2026-04-27, fourth pass)

Triggered by a third round of live testing: the Tidy button was
hidden behind a preview-mode toggle, the lightbox felt detached from
the page (opaque black ate everything), tiles were static at rest,
and caption placement was inconsistent across block types. Four
tracks shipped. One new migration written (Supabase MCP was
disconnected this turn — apply manually before customer-facing
deploy; the storefront has a defensive fallback that drops missing
columns from the SELECT, so the section stays online during the
migration window).

#### Track 1 — Tidy strip discoverability

| What | Where |
|---|---|
| `<GridHealth>` strip moved to **always-visible above the preview frame** (was nested inside the preview, only on grid mode). Visible whenever there's at least one block, regardless of preview mode. | `PreviewPane` in editor |
| Tidy button is **always rendered** for discoverability. Disabled with a tooltip ("Already optimal — no reorder would shrink the grid further.") when the current ordering can't be improved. | `GridHealth` |

#### Track 2 — Lightbox content-frame variant

| What | Where |
|---|---|
| Replaced the full-viewport opaque overlay with a **translucent backdrop** (`bg-black/55 backdrop-blur-md`) plus a **centered opaque content frame** (`w-[min(95vw,1400px)] h-[min(90vh,900px)]`). The product page is suggested through the blur without competing with the showcased media. | `StoryTileExpanded` |
| Frame has `rounded-xl ring-1 ring-white/10 shadow-2xl` for a defined edge; click outside the frame closes via Radix's overlay (default behaviour). Header gets its own subtle `bg-black/70 backdrop-blur-sm` so the close button stays legible. | `StoryTileExpanded` |
| Animation: `zoom-in-95` / `zoom-out-95` for a clean enter/exit instead of the v2 simple fade. | `StoryTileExpanded` |

#### Track 3 — Hover effects on tiles

All effects gated by `[@media(hover:hover)]` (skip on touch devices) **and** `motion-safe:` (skip when the user has reduced motion enabled). Touch and a11y-conscious users get static behaviour.

| What | Where |
|---|---|
| Image wrapper scales `1.0 → 1.04` over 500 ms ease-out on hover. Compounds with the user-set focal zoom rather than overriding it. | `<ImageOrPlaceholder>` |
| Stats values (`<dd>` elements) gently scale `1.0 → 1.05` on hover; labels stay anchored. Reads as "the numbers come forward". | `StatsBlock` |
| Comparison Expand button starts at `opacity-80`, goes to `opacity-100 scale-110` on tile hover so the affordance is obvious without being permanent. | `StoryTile` (comparison branch) |
| Caption strips fade from `opacity-90` to `opacity-100` on hover for a subtle attention bump. | `ImageBlock`, `ComparisonBlock` (always-visible mode) |

#### Track 4 — Caption mode (`always` | `hover`)

| What | Where |
|---|---|
| Migration `add_psb_caption_mode` adds `caption_mode text default 'always' check ('always','hover')`. Existing rows kept their look. **Apply manually** — Supabase MCP was disconnected this turn. | live SQL pending; file at `supabase/migrations/20260427_add_psb_caption_mode.sql` |
| `<TextStyleControls>` shows a new **Reveal: Always visible / On hover** segmented control, but only when the block type can sensibly use it: hero, feature Mode A, and image-with-caption. Stats and feature Mode B silently ignore it (text *is* the content / fundamentally beside the image). | `TextStyleControls` in editor |
| Renderer for **hero / feature Mode A**: the scrim + text overlay are now wrapped in a single fade container that goes `opacity-0 → 100` on group-hover when mode is `'hover'`. Image stays clean at rest. | `HeroOrFeatureModeA` |
| Renderer for **image with caption**: in `'hover'` mode the image fills the tile and the caption is overlaid at the bottom (with a subtle solid background) and fades in only on hover/focus. In `'always'` mode the caption sits in column flow below the image (existing behaviour). | `ImageBlock` |
| Both renderers also fire on `:focus-within` so keyboard users see the text without needing to hover. | `HeroOrFeatureModeA`, `ImageBlock` |
| Defensive SELECT fallback in `app/products/[slug]/page.tsx` extended to also strip `caption_mode` (and every other v3/v4 column) if the column is missing during the migration window. | `getStoryBlocksForProduct` |

#### Files touched (v4)

- New: `supabase/migrations/20260427_add_psb_caption_mode.sql`
- Modified: `lib/types/productStory.ts` (`CaptionMode`, `CAPTION_MODES`, `caption_mode` on `StoryBlock`)
- Modified: `components/products/StoryTile.tsx` (group hover transitions on image / stats / caption / Expand button; hover-reveal layouts for hero / feature-A / image-with-caption)
- Modified: `components/products/StoryTileExpanded.tsx` (translucent backdrop, centered opaque content frame, zoom enter/exit animation)
- Modified: `components/admin/ProductStoryEditor.tsx` (Tidy strip always visible above the preview; Tidy button always rendered, disabled when optimal; new Reveal segmented control in TextStyleControls)
- Modified: `components/products/ProductStorySection.tsx`, `app/products/[slug]/page.tsx` (SELECT_COLUMNS expanded; defensive fallback widened to strip any v3/v4 column)

#### Quality gates

- `npm run typecheck`: zero new errors. Pre-existing 6-error baseline (`Review.photos`, brands-join inference) unchanged.
- `npm run lint`: zero new findings on any v4 file.

#### Outstanding for live verification

1. Apply the `add_psb_caption_mode` migration via Supabase Studio or `supabase db push` (or wait for MCP to reconnect).
2. Open a product with at least one block in the editor — confirm the Grid health strip appears above the preview frame on first open, with a Tidy button (disabled when nothing to improve).
3. Click an image / hero tile on the storefront — confirm the lightbox now shows a centered frame with the page softly visible behind the blur.
4. Hover a tile on a desktop browser — confirm the image gently zooms; stats values gently grow; caption strips brighten.
5. Set a hero block to **Reveal: On hover** in the editor and confirm: clean image at rest on the storefront, text + scrim fade in on hover or keyboard focus.

### Discover v5 batch (2026-04-27, fifth pass)

Triggered by another round of live testing: the lightbox had asymmetric vertical padding (header bar ate top space, bottom flush), the right-side text panel for hero/feature lightbox bodies felt cluttered, no zoom inside the lightbox, hover-mode reveal didn't fire in the editor preview, and caption strips were opaque blocks below the image instead of polished translucent overlays. Five tracks shipped in one pass; no new migration needed (everything is renderer-side).

#### Track 1 — Lightbox vertical symmetry + floating close

| What | Where |
|---|---|
| Removed the `h-14` header bar from the lightbox content frame. The image / slider / stats panel now spans the full frame height, eliminating the top-only breathing room that made bottom edges look flush. | `StoryTileExpanded` |
| Added a small floating **close button** (`Maximize2`-style minus the icon — uses `<X>`) at the top-right of the frame: `bg-black/55 backdrop-blur` with a subtle ring. Stays out of the way until needed. | `StoryTileExpanded` |
| Screen-reader title now `<DialogPrimitive.Title className="sr-only">` — keyboard / AT users still get a labelled dialog, but no visual title clutter. | `StoryTileExpanded` |

#### Track 2 — Lightbox zoom (`<ZoomableImage>`)

| What | Where |
|---|---|
| New `<ZoomableImage>` component handles zoom + pan inside the lightbox: wheel-to-zoom anchored at cursor, a bottom-right toolbar (`[−] 100% [+] ↺`), drag-pan once zoomed past 1×, click-to-zoom-in for non-wheel users. Range 1×–4×, `STEP = 0.25`. Pan is clamped so the image can't leave the frame. | `components/products/ZoomableImage.tsx` (new) |
| Wired into the **Hero / Feature** and **Image** lightbox bodies. **Stats** has no image; **Comparison** uses its own slider — neither uses zoom. | `StoryTileExpanded` |
| At scale=1 the component renders identically to a plain `object-contain <Image>` so the lightbox at rest looks the same as v4. | `ZoomableImage` |

#### Track 3 — Drop the right-side text panel from Hero / Feature lightbox

| What | Where |
|---|---|
| `<HeroOrFeatureExpanded>` no longer splits the lightbox into image-left + text-right. The image fills the whole frame and the headline + body render as a translucent overlay anchored to the bottom of the image (same component, `<BottomTextOverlay>`, used by Image and Comparison bodies). | `StoryTileExpanded` |
| Lightbox bodies are now visually consistent across types: full-bleed media + (optional) translucent bottom strip. | — |

#### Track 4 — Preview-mode group fix + Reveal verification

| What | Where |
|---|---|
| Tile root always carries the `group` class, regardless of whether the tile is rendered as a `<button>` (clickable) or a `<div>` (preview / static). Previously the preview-mode `<div>` skipped `group`, so editor previews never fired hover-reveal animations. Authors testing **Reveal: On hover** now see the hover effect inside the editor preview. | `StoryTile` (comparison branch + non-clickable branch) |
| Color picker round-trip verified: `<ColorControl>` → `queuePatch({ text_color })` → DB update → live optimistic state → renderer applies via inline `style.color`. Working correctly; the original "color picker stops working" symptom was the preview-mode group bug. Editor preview now hover-reveals the text *and* shows the colour change at rest (the swatch + hex input still update regardless of caption_mode). | — |

#### Track 5 — Translucent overlay captions on the storefront

| What | Where |
|---|---|
| `<ImageBlock>` and `<ComparisonBlock>` always-mode caption layouts rewritten: the caption is now an **absolute-positioned translucent strip at the bottom of the image** (`bg-black/45` for light text, `bg-white/75` for dark text, both with `backdrop-blur-sm`). The image fills the entire tile in both always and hover modes. | `StoryTile.tsx` |
| Hover mode keeps the same overlay style; the only difference is initial opacity (0 vs 90) and the hover-revealed transition. | `StoryTile.tsx` |
| Result: existing captions visually shift from "below the image as a separate strip" to "translucent overlay at the bottom of the image". Strictly more polished, no DB migration. | — |

#### Files touched (v5)

- New: `components/products/ZoomableImage.tsx`
- Rewritten: `components/products/StoryTileExpanded.tsx` (floating close, full-bleed media, BottomTextOverlay component, ZoomableImage integration, no right-side panel)
- Modified: `components/products/StoryTile.tsx` (group class always present; ImageBlock + ComparisonBlock captions now translucent overlays)

No database migration this round — every change is renderer-side.

#### Quality gates

- `npm run typecheck`: zero new errors. Pre-existing 6-error baseline (`Review.photos`, brands-join inference) unchanged.
- `npm run lint`: zero new findings on any v5 file.

#### Outstanding for live verification

1. Open a lightbox on a Hero or Feature tile — confirm the image is centered with equal breathing room top and bottom (no header bar eating the top), close button floats top-right.
2. Inside a Hero / Feature / Image lightbox, scroll the wheel over the image — confirm zoom kicks in. Click + / − / ↺ in the toolbar. Drag once zoomed.
3. In the editor, set a hero block to **Reveal: On hover**, then hover the editor preview tile — confirm the text fades in. Change the text color via the picker and confirm the swatch/hex update + re-saves correctly.
4. View the storefront with an image-block and a comparison-block in always mode — confirm captions are now translucent overlays at the bottom of the image, not opaque strips below.

### Discover v6 batch (2026-04-27, sixth pass)

Triggered by another round of live testing: the storefront tile didn't reflect the picker's text/background colour, the v5 caption overlays were flat strips rather than the polished "rising-out-of-the-image" feel, the lightbox zoom toolbar was hidden behind the bottom caption, and there was no way to step between tiles without closing and reopening. Six tracks shipped in one pass; no migration needed.

#### Track 1 — Lightbox zoom toolbar moved to top-right

| What | Where |
|---|---|
| Toolbar `[−] 100% [+] ↺` repositioned from `bottom-3 right-3` to `top-16 right-3` (sits just under the close button). The bottom-anchored caption overlay no longer hides it. | `components/products/ZoomableImage.tsx` |

#### Track 2 — Lightbox prev / next navigation

| What | Where |
|---|---|
| `<StoryTileExpanded>` accepts new `onNavigate` / `hasPrev` / `hasNext` props. Renders translucent left + right chevron buttons (Lucide `ChevronLeft` / `ChevronRight`) vertically centred on either side of the frame, hidden when at boundaries. | `StoryTileExpanded` |
| Keyboard ← / → arrow keys trigger the same navigation. Window-level listener installed only while the lightbox is open; ignores key events from the zoom toolbar (gated by a `data-zoomable` ancestor check). | `StoryTileExpanded` |
| `<ProductStorySection>` computes prev/next from the live blocks list and swaps `openBlock` to the neighbour without closing the dialog. | `ProductStorySection` |

#### Track 3 — Inline-style colour application

| What | Where |
|---|---|
| `inlineTextColor()` rewritten to **always** return a CSS-color (`#ffffff` for null/light, `#0a0a0a` for dark, free-form hex passes through). Authors' picker values now drive the rendered text colour reliably across every block type. | `StoryTile.tsx` |
| Caption / overlay renderers (Hero / Feature Mode A, Image, Comparison) drop the legacy enum-derived class fallback (`text-white` / `text-neutral-900` / `bg-black/45` / etc.). Colour and background flow exclusively through inline `style` so picker values aren't overridden by `text-white/90` opacity classes. | `StoryTile.tsx` |
| `<TextStyleControls>` round-trip verified: pick a custom hex → DB UPDATE → optimistic local state → renderer applies inline `style.color`. Same for `text_bg`. | — |

#### Track 4 — Gradient-sweep overlay (the "rising-out-of-the-image" effect)

| What | Where |
|---|---|
| New `gradientOverlayStyle(block)` helper returns a CSS `linear-gradient(to top, …)` that fades from a translucent backdrop at the bottom to fully transparent ~45% up the overlay. Authors' `text_bg` (when set) replaces the gradient's solid stop. Without `text_bg`, the helper picks a sensible tint from the text colour's luminance: light text → dark sweep, dark text → light sweep. | `StoryTile.tsx` (exported) |
| Applied to `<HeroOrFeatureModeA>` (replaces flat scrim + 9-position layout — text is now always anchored at the bottom; `text_position` controls horizontal alignment only), `<ImageBlock>` caption, `<ComparisonBlock>` caption — both modes (always and hover). | `StoryTile.tsx` |
| Applied to the lightbox via a new `<BottomGradientOverlay>` helper inside `StoryTileExpanded`. Image, Hero/Feature, and Comparison lightbox bodies all use it for visual consistency. | `StoryTileExpanded` |

#### Track 5 — Tile = the polished surface

The combination of (a) the gradient sweep, (b) inline-style colour application, and (c) the v4 hover-reveal modes means the **storefront tile** now carries the same polish that previously only the lightbox had:

- Authors who set a custom red text colour see red on the tile.
- A custom green text-background renders as a green-fade-to-transparent sweep on the tile.
- Hero/feature blocks always anchor text at the bottom with the gradient — `text_position` becomes alignment-only.

#### Track 6 — Hero / Feature Mode A: bottom-anchored

| What | Where |
|---|---|
| Replaced the 9-position `POS_CLASSES` layout with a uniform bottom-anchored `flex flex-col justify-end` overlay. `text_position` keeps controlling **horizontal alignment** (left / center / right) within the bottom strip; the vertical part of the position is ignored. Visual change for existing rows that used `top-*` or `middle-*` text positions: their text now appears at the bottom. Strictly more polished and consistent with image / comparison captions. | `HeroOrFeatureModeA` |
| The v4 reveal-on-hover behaviour is preserved — `caption_mode='hover'` still fades the gradient + text from `opacity-0` to `1` on hover/focus. | `HeroOrFeatureModeA` |

#### Files touched (v6)

- Modified: `components/products/ZoomableImage.tsx` (toolbar moved to top-right)
- Modified: `components/products/StoryTileExpanded.tsx` (prev/next nav, keyboard arrows, BottomGradientOverlay helper using shared `gradientOverlayStyle`)
- Modified: `components/products/StoryTile.tsx` (`gradientOverlayStyle()` helper, exported `inlineTextColor` / `inlineBgColor` / `textAlignFromPosition`; gradient sweep applied to Hero/Feature Mode A, Image, Comparison; bottom-anchored layout for Hero/Feature Mode A)
- Modified: `components/products/ProductStorySection.tsx` (prev/next index plumbing)

No database migration this round — every change is renderer-side.

#### Quality gates

- `npm run typecheck`: zero new errors. Pre-existing 6-error baseline (`Review.photos`, brands-join inference) unchanged.
- `npm run lint`: zero new findings on any v6 file.

#### Outstanding for live verification

1. Set a custom hex text colour on a hero block → confirm the tile shows the chosen colour (not the legacy white / black).
2. Set a custom hex text-background on the same block → confirm the gradient sweep on the tile picks up that colour and fades to transparent at the top.
3. Hover a hero / feature / image / comparison tile on desktop → confirm text + gradient feel like they're rising out of the image, not sitting on a flat strip.
4. Open the lightbox on a tile with a long caption + a Hero block → confirm the zoom toolbar is visible at the top-right and the caption sits at the bottom-right without overlap.
5. Open the lightbox and tap the chevron arrows on either side, then press ← / → on the keyboard → confirm prev/next navigation cycles through the surrounding tiles. Arrows hide at boundaries.

### Discover v7 batch (2026-04-27, seventh pass — same-day polish)

Two small polish edits done in flight. Captured here for completeness.

| What | Where |
|---|---|
| Gradient overlay opacity halved across the board, then halved again on the second pass — landing at `0.06 / 0.22` (light text on dark sweep) and `0.10 / 0.32` (dark text on light sweep). Author-set bg ramps `0.32 → 0.10 → 0`. The tile gradient is now barely-there. | `gradientOverlayStyle` in StoryTile |
| Lightbox `<BottomGradientOverlay>` had its `background` removed entirely — text rides directly on the image with only a single `text-shadow` for legibility. The overlay is layout-only at this point. | `BottomGradientOverlay` in StoryTileExpanded |

### Discover v8 batch (2026-04-27, eighth pass)

Triggered by the next round of live testing: caption text on busy images was hard to read after v7 stripped the lightbox backdrop, and the lightbox enter animation appeared to slide in from the bottom-right instead of expanding from the centre. Three tracks shipped. One new migration applied live to project `bjudxntmpfpbyloibloc`.

#### Track 1 — Layered text-shadow (always on)

| What | Where |
|---|---|
| New exported `textShadowFor(block)` returns a layered CSS `text-shadow` keyed off the text colour's luminance: a 1 px-blur near-opaque outline traces the glyphs (crisp dark for light text, crisp white for dark text), plus an 8 px-blur soft halo for ambient separation. Applied to every overlay-text element on both the tile and the lightbox. | `StoryTile.tsx` (helper); both renderers |

#### Track 2 — Frosted-glyph backdrop (opt-in via `caption_backdrop`)

| What | Where |
|---|---|
| Migration `add_psb_caption_backdrop` adds `caption_backdrop boolean not null default false`. Every existing row keeps its v7 visual treatment. | live migration; `supabase/migrations/20260427_add_psb_caption_backdrop.sql` |
| New exported `glyphBackdropClass(block)` returns the classes for a tight blurred pill behind the text *only* — `box-decoration-clone` so each wrapped line gets its own pill, `bg-black/35` for light text or `bg-white/55` for dark text, plus `backdrop-blur-md`. Each text element wraps its content in `<span class={glyphBackdropClass}>`. | `StoryTile.tsx` (helper); applied in HeroOrFeatureModeA, ImageBlock caption, ComparisonBlock caption + matching lightbox bodies |
| New editor checkbox **"Frosted backdrop on text"** added inside `<TextStyleControls>`. Visible when the block is text-on-image (hero / feature Mode A / image-with-caption / comparison-with-caption); hidden for stats / feature Mode B. Defaults to off. | `TextStyleControls` in `ProductStoryEditor` |
| Defensive SELECT fallback in `app/products/[slug]/page.tsx` extended to drop `caption_backdrop` if the column is missing. | `getStoryBlocksForProduct` |

#### Track 3 — Lightbox enter animation: centre-out at 240 ms

| What | Where |
|---|---|
| Added explicit `style={{ transformOrigin: '50% 50%' }}` on `DialogPrimitive.Content`. The combination of Tailwind `zoom-in-95` and the centring translates was reading as a corner-anchored zoom; the explicit origin pins the pivot to the centre. | `StoryTileExpanded` |
| Bumped the open/close animation duration to `duration-[240ms]` for a slightly more "open" feel. | `StoryTileExpanded` |
| Tile-anchored expand (FLIP / shared-element) is flagged as a v9 candidate if centre-out isn't enough. | — |

#### Files touched (v8)

- New: `supabase/migrations/20260427_add_psb_caption_backdrop.sql`
- Modified: `lib/types/productStory.ts` (optional `caption_backdrop` on `StoryBlock`)
- Modified: `components/products/StoryTile.tsx` (`textShadowFor` + `glyphBackdropClass` helpers; tile text wraps spans with shadow + optional frost)
- Modified: `components/products/StoryTileExpanded.tsx` (lightbox text uses the same helpers; `transformOrigin` pinned to centre; `duration-[240ms]`)
- Modified: `components/admin/ProductStoryEditor.tsx` (caption_backdrop checkbox in `TextStyleControls`)
- Modified: `components/products/ProductStorySection.tsx`, `app/products/[slug]/page.tsx` (SELECT_COLUMNS expanded; defensive fallback widened)

#### Quality gates

- `npm run typecheck`: zero new errors. Pre-existing 6-error baseline unchanged.
- `npm run lint`: zero new findings on any v8 file.

#### Outstanding for live verification

1. View a tile with caption text on a light/busy image — confirm the layered text-shadow makes the text noticeably crisper than v7 (single light shadow).
2. Tick **Frosted backdrop on text** in the editor for a problem block, save, view the storefront — confirm a small blurred pill appears only behind the text glyphs (each line gets its own pill on multi-line text).
3. Open the lightbox — confirm the enter animation reads as a centre-out zoom, not a bottom-right slide. Close and reopen a few times to verify symmetry.
4. Confirm the 240 ms duration feels intentional.

### Discover v9 batch (2026-04-27, ninth pass)

Triggered by author requests for finer typographic control on overlays and a richer colour-suggestion source. Two tracks shipped. One new migration applied live to project `bjudxntmpfpbyloibloc`.

#### Track 1 — Text weight selector

| What | Where |
|---|---|
| Migration `add_psb_text_weight` adds `text_weight text default 'bold' check (text_weight in ('light','normal','medium','semibold','bold','extrabold'))`. Default `'bold'` preserves every existing row's appearance. | live migration; `supabase/migrations/20260427_add_psb_text_weight.sql` |
| New exported `weightClass(block)` helper in `StoryTile.tsx` returns the matching Tailwind `font-*` class. Defaults to `font-bold` for null. | `StoryTile.tsx` |
| Applied to headlines and stats values in: Hero/Feature Mode A overlays, Feature Mode B headline, Stats headline + values. Body / caption text stays at default weight. `tailwind-merge` deduplicates the existing `font-bold` from the size helpers so the chosen weight wins. | `StoryTile.tsx`, `StoryTileExpanded.tsx` |
| New **Weight** select in `<TextStyleControls>` between Size and Position. Six options shown as Light / Normal / Medium / Semibold / Bold / Extrabold. The grid widened from 2 cols to 3 cols on `sm+`. | `TextStyleControls` in `ProductStoryEditor` |
| Defensive SELECT fallback in `app/products/[slug]/page.tsx` extended to drop `text_weight` if missing. | `getStoryBlocksForProduct` |

#### Track 2 — Image-palette suggestion mode

| What | Where |
|---|---|
| New `'image-palette'` value on the `SuggestionMode` union. The analyzer now returns the top-N most-frequent histogram bins (sorted by count, de-duplicated by Euclidean RGB distance < 12). Capped at 5 swatches. | `lib/colorSuggester.ts` |
| New helpers `dedupeNearbyHexes()` and `rankImagePalette()` (suggestions with informational contrast vs. the dominant). | `lib/colorSuggester.ts` |
| Editor's `<ColorControl>` segmented control gains a third **Image palette** button alongside *Best contrast* and *Match dominant*. The AA-only checkbox auto-disables (line-through + tooltip) when image-palette is selected — these colours come from the image itself and won't pass contrast against it. An inline note reminds authors to pair with a frosted backdrop for readability. | `ColorControl` in editor |
| Info tooltip rewritten to describe all three modes in one sentence each. | `ColorControl` |

#### Files touched (v9)

- New: `supabase/migrations/20260427_add_psb_text_weight.sql`
- Modified: `lib/types/productStory.ts` (`TextWeight` + `TEXT_WEIGHTS`; `text_weight` on `StoryBlock`)
- Modified: `lib/colorSuggester.ts` (`SuggestionMode` widened; `dedupeNearbyHexes` + `rankImagePalette`; sortedBins path)
- Modified: `components/products/StoryTile.tsx` (`weightClass` helper; applied to overlay headings + stats values)
- Modified: `components/products/StoryTileExpanded.tsx` (`weightClass` applied to lightbox bodies)
- Modified: `components/admin/ProductStoryEditor.tsx` (Weight select; image-palette button; AA-disabled-when-image-palette)
- Modified: `components/products/ProductStorySection.tsx`, `app/products/[slug]/page.tsx` (SELECT_COLUMNS + defensive fallback expanded)

#### Quality gates

- `npm run typecheck`: zero new errors. Pre-existing 6-error baseline unchanged.
- `npm run lint`: zero new findings on any v9 file.

#### Outstanding for live verification

1. In the editor, open a hero block. Cycle the **Weight** select through Light → Extrabold and confirm the headline (and the live preview) show the change immediately.
2. Open a stats block. Confirm Weight changes both the optional headline *and* the value numbers (`94%`, `28 days`, etc.). Labels stay at default weight.
3. Open **Image palette** suggestion mode on a colourful product photo — confirm 3–5 distinct swatches with the dominant first; no near-duplicates.
4. Toggle the AA-only checkbox while in image-palette mode — confirm it's visually disabled / line-through and clicking does nothing. Switch back to Best contrast — confirm AA-only re-enables.

---

## How to use this doc

1. **Triage**: walk through items A → H with the team. Re-tag P0/P1/P2
   as needed.
2. **Sequence**: every cluster v1 → v9 shipped on 2026-04-27 — see
   Section I for the rollups. The next high-leverage cluster is
   **DISC-A8** (atomic reorder via SQL function), **DISC-C1** (delete old image
   on replace), **DISC-D2** (soft-delete / undo), and **DISC-F4** (alt enforced
   before save). v10 candidates: tile-anchored expand animation (FLIP
   pattern) for the lightbox; hard-block save on AA-failing colour
   combos; admin-editable colour preset palette; pixel-precise crop
   (vs. focal-point); per-breakpoint focal point; pinch-zoom inside
   the lightbox on touch devices; gallery-style slide transitions
   between neighbouring tiles when navigating with the chevron arrows;
   separate body-weight column (currently weight applies only to
   headlines + stats values).
3. **Track**: as items ship, strike through with `✅ DONE <date>` on
   their headings and add a one-paragraph note pointing at the files
   touched. Append a row to the table in Section I.
4. **Re-review** quarterly — the P2 list will shorten naturally as
   architecture decisions land.
