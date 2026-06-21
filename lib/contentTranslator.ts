// lib/contentTranslator.ts
//
// Phase 2.4: the runtime-side mirror of scripts/translate-content.mjs.
//
// Same Anthropic Claude Haiku 4.5 pipeline, but designed to be called
// from Next.js API routes when an admin (or the post-save background
// hook) needs to translate a single entity on demand. The script
// remains the bulk backfill tool; this module is the per-row hot
// path.
//
// Design choices:
//   - Pure functions. No Supabase coupling — caller supplies the
//     source row and writes the result. This keeps the module easy
//     to test and lets API routes use their own auth-scoped Supabase
//     client (the script uses the service role).
//   - Same hashing + key-shape validation as the script, so source
//     drift detection works identically regardless of which path
//     produced the row.
//   - Identical prompt text and rules — both paths must produce
//     consistent output, or admins editing a row will see jarring
//     style shifts compared to script-translated rows.

import { createHash } from "node:crypto";

// ─── Entity config (single source of truth for both paths) ─────────

export type TranslatableKind = "products" | "brands" | "categories" | "banners";

export type EntityConfig = {
  label: string;
  /** The base table holding the canonical English content. */
  sourceTable: string;
  /** Filter applied when listing source rows (e.g. only published). */
  sourceFilter: Record<string, any> | null;
  /** Columns the storefront cares about (used to fetch source rows). */
  sourceColumns: readonly string[];
  /** Subset of sourceColumns whose values are user-visible English
   *  copy and therefore need to be translated. Brand/product names
   *  are intentionally excluded — they stay in their canonical form. */
  translatableFields: readonly string[];
  /** Translation table name. */
  translationsTable: string;
  /** Column on the translations table pointing back to the source row. */
  fkColumn: string;
};

export const KINDS: Record<TranslatableKind, EntityConfig> = {
  products: {
    label: "Product",
    sourceTable: "products",
    sourceFilter: { is_published: true },
    sourceColumns: [
      "id",
      "name",
      "short_description",
      "description",
      "ingredients_md",
      "additional_details_md",
      "key_features_md",
      "box_contents_md",
      "faq",
      "key_benefits",
      "additional_details",
    ],
    translatableFields: [
      "short_description",
      "description",
      "ingredients_md",
      "additional_details_md",
      "key_features_md",
      "box_contents_md",
      "faq",
      "key_benefits",
      "additional_details",
    ],
    translationsTable: "product_translations",
    fkColumn: "product_id",
  },
  brands: {
    label: "Brand",
    sourceTable: "brands",
    sourceFilter: null,
    sourceColumns: ["id", "name", "description"],
    translatableFields: ["description"],
    translationsTable: "brand_translations",
    fkColumn: "brand_id",
  },
  categories: {
    label: "Category",
    sourceTable: "categories",
    sourceFilter: null,
    sourceColumns: ["id", "name", "description"],
    translatableFields: ["name", "description"],
    translationsTable: "category_translations",
    fkColumn: "category_id",
  },
  banners: {
    label: "Banner",
    sourceTable: "home_banners",
    sourceFilter: { active: true },
    sourceColumns: ["id", "title", "alt"],
    translatableFields: ["title", "alt"],
    translationsTable: "banner_translations",
    fkColumn: "banner_id",
  },
};

// Must mirror lib/locales.ts. Importing it here would drag a "use
// client" boundary in via LOCALE_INFO, so we duplicate the small bit
// we need.
export const TARGET_LOCALES = ["en", "pl", "vi", "th", "fr", "de", "es", "it", "pt"] as const;
export type TargetLocale = (typeof TARGET_LOCALES)[number];

const LOCALE_NAME: Record<TargetLocale, string> = {
  en: "English (generic, non-Indian markets)",
  pl: "Polish",
  vi: "Vietnamese",
  th: "Thai",
  fr: "French (France)",
  de: "German (Germany)",
  es: "Spanish (Spain)",
  it: "Italian (Italy)",
  pt: "Portuguese (Portugal)",
};

// ─── Source-hash helper (mirrors the script) ────────────────────────

export function namespaceHash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value ?? null)).digest("hex");
}

/** Picks the subset of fields the translator actually needs to see. */
export function pickTranslatablePayload(
  kind: TranslatableKind,
  sourceRow: Record<string, any>
): Record<string, any> {
  const cfg = KINDS[kind];
  const out: Record<string, any> = {};
  for (const f of cfg.translatableFields) out[f] = sourceRow[f] ?? null;
  return out;
}

// ─── Anthropic call ─────────────────────────────────────────────────

const MODEL = "claude-haiku-4-5-20251001";
const API_URL = "https://api.anthropic.com/v1/messages";

function buildPrompt(
  kindLabel: string,
  targetLocale: TargetLocale,
  nameForContext: string | null,
  payload: Record<string, any>
): string {
  const localeName = LOCALE_NAME[targetLocale] || targetLocale;
  const contextLine = nameForContext
    ? `Source ${kindLabel} (English name, do NOT translate): "${nameForContext}"`
    : `Source kind: ${kindLabel}`;
  return [
    `You are translating ${kindLabel.toLowerCase()} content for the MadenKorea storefront, a Korean beauty e-commerce site.`,
    ``,
    `Source language: English (India).`,
    `Target language: ${localeName} (locale code: ${targetLocale}).`,
    contextLine,
    ``,
    `Rules — follow ALL of them:`,
    `1. Return STRICT JSON only. No markdown fences, no prose. The first character of your output must be "{" and the last must be "}".`,
    `2. The output object must contain EXACTLY the same top-level keys as the input. Translate ONLY the string values (or strings inside jsonb arrays/objects).`,
    `3. For string fields containing Markdown (ingredients_md, additional_details_md, key_features_md, box_contents_md, description, etc.): preserve ALL Markdown syntax verbatim — headings (#), lists (- and 1.), bold/italics, links, line breaks. Translate only the visible English text between the markup.`,
    `4. For jsonb fields (faq, key_benefits, additional_details): they may be arrays of objects like [{"q": "...", "a": "..."}] or arrays of strings or objects with English string values. Preserve the EXACT JSON shape (same keys, same array length, same object structure). Translate only the string values that the customer sees. Do NOT translate keys.`,
    `5. Do NOT translate brand names, product names, ingredient INCI names (e.g. "Hyaluronic Acid", "Niacinamide", "Glycerin", "Centella Asiatica"), proper nouns, certification names ("FDA", "ISO", "CDSCO"), or units ("ml", "g", "mg/L").`,
    `6. Numbers, percentages, currency symbols, and product codes stay verbatim.`,
    `7. Keep tone customer-friendly and aligned with retail e-commerce (think Sephora, Yves Rocher, Olive Young).`,
    `8. CRITICAL: Do not place any straight ASCII double-quote character (") inside string values — straight quotes break JSON. Use curly Unicode quotes appropriate to the target language. If unsure, omit inner quotation marks entirely.`,
    `9. If a field is null or empty in the source, return null/empty for that field in the output.`,
    ``,
    `Source object:`,
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

export async function translateOnePayload(
  apiKey: string,
  kindLabel: string,
  targetLocale: TargetLocale,
  nameForContext: string | null,
  payload: Record<string, any>
): Promise<Record<string, any>> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: buildPrompt(kindLabel, targetLocale, nameForContext, payload),
        },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json: any = await res.json();
  const textBlock = (json.content || []).find((c: any) => c.type === "text");
  if (!textBlock) throw new Error("Anthropic response missing text content");

  let text = String(textBlock.text).trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n/, "").replace(/\n?```$/, "").trim();
  }
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    throw new Error(
      `Translated payload was not valid JSON. First 400 chars: ${text.slice(
        0,
        400
      )}. Parse: ${err.message}`
    );
  }
  const srcKeys = Object.keys(payload).sort();
  const outKeys = Object.keys(parsed).sort();
  if (JSON.stringify(srcKeys) !== JSON.stringify(outKeys)) {
    throw new Error(
      `Key mismatch. Expected ${srcKeys.join(",")}, got ${outKeys.join(",")}`
    );
  }
  return parsed;
}

// ─── High-level "translate one entity" used by API routes ───────────

export type TranslateEntityResult = {
  kind: TranslatableKind;
  entityId: string;
  translated: number;
  skipped: number;
  humanLocked: number;
  errors: { locale: TargetLocale; message: string }[];
};

/**
 * Translate a single entity to one or more target locales. The
 * caller is responsible for:
 *   - Fetching the source row from Supabase (with the columns listed
 *     in KINDS[kind].sourceColumns).
 *   - Persisting the returned translation rows.
 *
 * Returns a per-locale outcome map so the API route can write back to
 * the client.
 */
export async function translateEntity(opts: {
  apiKey: string;
  kind: TranslatableKind;
  sourceRow: Record<string, any>;
  locales?: TargetLocale[];
  /** Map of locale -> existing row (with source_hash + source). When
   *  the source content hash matches an existing AI translation,
   *  that locale is skipped unless force is true. Human-edited rows
   *  are always skipped regardless of force. */
  existingByLocale?: Map<TargetLocale, { source_hash: string | null; source: string }>;
  force?: boolean;
  /**
   * Called once per locale with the upsert payload right after a
   * successful translation. Returns when persisted. Used so callers
   * can hold their own transaction or audit trail.
   */
  onLocaleTranslated: (locale: TargetLocale, row: Record<string, any>) => Promise<void>;
  /** Optional progress callback (locale-level). */
  onProgress?: (locale: TargetLocale, status: "done" | "skipped" | "human-locked" | "error", err?: string) => void;
}): Promise<TranslateEntityResult> {
  const {
    apiKey,
    kind,
    sourceRow,
    locales = [...TARGET_LOCALES],
    existingByLocale = new Map(),
    force = false,
    onLocaleTranslated,
    onProgress,
  } = opts;

  const cfg = KINDS[kind];
  const payload = pickTranslatablePayload(kind, sourceRow);
  const sourceHash = namespaceHash(payload);
  const nameForContext = (sourceRow["name"] as string | undefined) ?? null;

  const result: TranslateEntityResult = {
    kind,
    entityId: sourceRow["id"],
    translated: 0,
    skipped: 0,
    humanLocked: 0,
    errors: [],
  };

  // Sort locales into work vs skip BEFORE dispatch so progress totals
  // are accurate even with concurrency, and the Anthropic calls (the
  // slow part) only fire for locales that actually need translation.
  type LocaleWork = { locale: TargetLocale };
  const work: LocaleWork[] = [];
  for (const locale of locales) {
    const ex = existingByLocale.get(locale);
    if (ex?.source === "human") {
      result.humanLocked += 1;
      onProgress?.(locale, "human-locked");
      continue;
    }
    if (!force && ex?.source_hash === sourceHash) {
      result.skipped += 1;
      onProgress?.(locale, "skipped");
      continue;
    }
    work.push({ locale });
  }

  // Locale concurrency — Anthropic Haiku tier-1 is ~100 RPM, well
  // beyond what 5 parallel calls can hit. The cap mostly protects us
  // from a future tier downgrade and from amplifying network errors
  // when the source row triggers a retry storm. Sequential previously
  // meant 7 locales × ~5s = ~35s per entity; with cap=5 it's closer
  // to ~10s per entity (one round of 5, then the remainder).
  const LOCALE_CONCURRENCY = 5;

  for (let i = 0; i < work.length; i += LOCALE_CONCURRENCY) {
    const chunk = work.slice(i, i + LOCALE_CONCURRENCY);
    await Promise.all(
      chunk.map(async ({ locale }) => {
        try {
          const translated = await translateOnePayload(
            apiKey,
            cfg.label,
            locale,
            nameForContext,
            payload
          );
          await onLocaleTranslated(locale, {
            [cfg.fkColumn]: sourceRow["id"],
            locale,
            ...translated,
            source_hash: sourceHash,
            source: "ai",
            updated_at: new Date().toISOString(),
          });
          result.translated += 1;
          onProgress?.(locale, "done");
        } catch (err: any) {
          result.errors.push({
            locale,
            message: err?.message ?? String(err),
          });
          onProgress?.(locale, "error", err?.message ?? String(err));
        }
      })
    );
  }

  return result;
}
