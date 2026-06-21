// lib/contentTranslations.ts
//
// Phase 2.3 storefront helper: merge a Supabase entity row with its
// per-locale translation (if any), returning a row where translatable
// fields come from the translation and untranslatable fields
// (id/slug/price/images/booleans/dates) come from the source.
//
// Translation rows live in:
//   product_translations  (product_id, locale, short_description, description, ingredients_md, …)
//   brand_translations    (brand_id, locale, description)
//   category_translations (category_id, locale, name, description)
//   banner_translations   (banner_id, locale, title, alt)
//
// Why a helper instead of a Postgres view:
//   - The active locale is a runtime value (cookie); a view would need
//     an RPC + a session variable to filter.
//   - The customer fetches via PostgREST embeds. Embedding the
//     translations table inline keeps queries flat and cacheable.
//   - Falling back to English is fine and expected when a translation
//     row doesn't exist yet.
//
// Usage pattern (server component):
//
//   const supabase = supabaseRSC();
//   const { data } = await supabase
//     .from("products")
//     .select(`*, product_translations!left(locale, short_description, description, …)`)
//     .eq("slug", slug)
//     .single();
//   const product = mergeTranslation(data, locale, PRODUCT_TRANSLATABLE_FIELDS);
//
// Same shape for brand_translations, category_translations,
// banner_translations.

export const PRODUCT_TRANSLATABLE_FIELDS = [
  "short_description",
  "description",
  "ingredients_md",
  "additional_details_md",
  "key_features_md",
  "box_contents_md",
  "faq",
  "key_benefits",
  "additional_details",
] as const;

export const BRAND_TRANSLATABLE_FIELDS = ["description"] as const;
export const CATEGORY_TRANSLATABLE_FIELDS = ["name", "description"] as const;
export const BANNER_TRANSLATABLE_FIELDS = ["title", "alt"] as const;

type TranslationRow = { locale: string; [k: string]: any };

/**
 * Pick the translation row matching the active locale (or null) from
 * an array of embedded `*_translations` rows.
 */
export function pickTranslation<T extends TranslationRow>(
  rows: T[] | T | null | undefined,
  locale: string
): T | null {
  if (!rows) return null;
  const arr = Array.isArray(rows) ? rows : [rows];
  return arr.find((r) => r?.locale === locale) ?? null;
}

/**
 * Merge a source row with its translation. The returned row contains
 * the source fields unchanged, with translatable fields replaced by
 * the translation when present and non-null. The translation array
 * itself is stripped from the result so callers don't pass it through
 * to UI components by accident.
 *
 * `translationsKey` defaults to `<table>_translations` but can be
 * overridden when the embed alias is different.
 */
export function mergeTranslation<T extends Record<string, any>>(
  source: T,
  locale: string,
  translatableFields: readonly string[],
  translationsKey = guessTranslationsKey(source)
): T {
  if (!source) return source;
  const translations = translationsKey ? (source as any)[translationsKey] : null;
  const tr = pickTranslation(translations as any, locale);
  const merged: any = { ...source };
  if (translationsKey) delete merged[translationsKey];
  if (!tr) return merged as T;
  for (const f of translatableFields) {
    const value = tr[f];
    if (value !== undefined && value !== null && value !== "") {
      merged[f] = value;
    }
  }
  return merged as T;
}

function guessTranslationsKey(source: Record<string, any>): string | null {
  for (const k of [
    "product_translations",
    "brand_translations",
    "category_translations",
    "banner_translations",
  ]) {
    if (Array.isArray(source[k]) || (source[k] && typeof source[k] === "object")) {
      return k;
    }
  }
  return null;
}

/**
 * Merge an array of source rows with their embedded translations in
 * one shot.
 */
export function mergeTranslations<T extends Record<string, any>>(
  rows: T[] | null | undefined,
  locale: string,
  translatableFields: readonly string[],
  translationsKey?: string
): T[] {
  if (!rows || rows.length === 0) return [];
  return rows.map((r) => mergeTranslation(r, locale, translatableFields, translationsKey));
}
