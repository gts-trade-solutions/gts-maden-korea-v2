#!/usr/bin/env node
// scripts/translate-content.mjs
//
// Phase 2.3: translate database-backed content (products, brands,
// categories, banners) into every non-source locale using Anthropic.
//
// Sibling to scripts/translate-messages.mjs (which handles the static
// UI JSON bundle). Same pipeline pattern — per-locale, per-row,
// throttled, diff-aware via SHA-1 source hashes stored on the
// translation row itself.
//
// Usage from repo root:
//
//   node scripts/translate-content.mjs                      # all entities, all locales
//   node scripts/translate-content.mjs products             # one entity kind
//   node scripts/translate-content.mjs products brands      # multiple
//   node scripts/translate-content.mjs --force              # ignore source-hash, rebuild every row
//   node scripts/translate-content.mjs --locales pl,vi      # restrict locales
//
// What gets translated, by entity:
//   products    is_published = true                short_description, description,
//                                                  ingredients_md, additional_details_md,
//                                                  key_features_md, box_contents_md,
//                                                  faq, key_benefits, additional_details
//   brands      all                                description
//   categories  all                                name, description
//   banners     active = true                      title, alt
//
// Decisions baked in:
//   - Product names + brand names stay English forever (K-beauty norm).
//   - jsonb fields are translated by serializing → sending to Claude →
//     re-parsing, with explicit prompt rules that the JSON shape must
//     be preserved. Keys stay English; values translate.
//   - Markdown fields keep their structure (headings, lists, code
//     fences) — the prompt tells Claude to preserve markdown verbatim
//     and translate only the visible text.
//   - Source-hash diff: each row records sha-1 of the source content
//     at translation time. Re-runs skip rows whose hash hasn't
//     changed. Set --force to ignore.
//   - Admin-edited rows (source = 'human') are NEVER overwritten by
//     the script. They're considered authoritative.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ── env loader (same as translate-messages.mjs) ───────────────────
function loadEnv() {
  const envPath = join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) throw new Error(`.env not found at ${envPath}`);
  const raw = readFileSync(envPath, "utf8");
  const env = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}
const envFile = loadEnv();
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || envFile.ANTHROPIC_API_KEY;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || envFile.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || envFile.SUPABASE_SERVICE_ROLE_KEY;

for (const [k, v] of [
  ["ANTHROPIC_API_KEY", ANTHROPIC_API_KEY],
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_KEY],
]) {
  if (!v) {
    console.error(`${k} missing (checked process.env and .env)`);
    process.exit(1);
  }
}

// ── CLI arg parsing ───────────────────────────────────────────────
const args = process.argv.slice(2);
const force = args.includes("--force");
const localeArgIdx = args.indexOf("--locales");
const requestedLocales =
  localeArgIdx >= 0 && args[localeArgIdx + 1]
    ? args[localeArgIdx + 1].split(",").map((s) => s.trim()).filter(Boolean)
    : null;

const KIND_ALIASES = {
  products: "products",
  product: "products",
  brands: "brands",
  brand: "brands",
  categories: "categories",
  category: "categories",
  banners: "banners",
  banner: "banners",
};
// Strip the `--locales <value>` pair from the positional args. When
// `--locales` isn't passed (localeArgIdx === -1), we MUST NOT filter
// by args[0] — that would silently eat a kind argument like
// `translate-content.mjs categories` and quietly run everything.
const localeArgValue = localeArgIdx >= 0 ? args[localeArgIdx + 1] : null;
const requestedKinds = args
  .filter((a, i) => i !== localeArgIdx && a !== localeArgValue)
  .filter((a) => !a.startsWith("--"))
  .filter((a, i, arr) => arr.indexOf(a) === i)
  .map((a) => KIND_ALIASES[a])
  .filter(Boolean);

// ── locales (must match lib/locales.ts) ───────────────────────────
const ALL_TARGETS = ["en", "pl", "vi", "fr", "de", "es", "it", "pt"];
const targets =
  requestedLocales && requestedLocales.length > 0
    ? requestedLocales.filter((l) => ALL_TARGETS.includes(l))
    : ALL_TARGETS;

const LOCALE_NAME = {
  en: "English (generic, non-Indian markets)",
  pl: "Polish",
  vi: "Vietnamese",
  fr: "French (France)",
  de: "German (Germany)",
  es: "Spanish (Spain)",
  it: "Italian (Italy)",
  pt: "Portuguese (Portugal)",
};

// ── Entity configs ────────────────────────────────────────────────
// Each kind tells the script:
//   - source table + filter
//   - the source column listing translatable fields
//   - translation table
//   - the column linking back to the source row
const KINDS = {
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
    // The keys we actually send to Claude (skip `id` and `name`).
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

const kindsToRun = requestedKinds.length > 0 ? requestedKinds : Object.keys(KINDS);

// ── Supabase REST helpers ─────────────────────────────────────────
// PostgREST URL — avoids pulling supabase-js into a script.
const REST = `${SUPABASE_URL}/rest/v1`;
const sbHeaders = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  "content-type": "application/json",
};

async function sbSelect(table, { select = "*", filter = null } = {}) {
  const url = new URL(`${REST}/${table}`);
  url.searchParams.set("select", select);
  if (filter) {
    for (const [k, v] of Object.entries(filter)) {
      url.searchParams.set(k, `eq.${v}`);
    }
  }
  const res = await fetch(url, { headers: sbHeaders });
  if (!res.ok) {
    throw new Error(`Supabase select ${table}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function sbUpsert(table, rows, { onConflict }) {
  const url = new URL(`${REST}/${table}`);
  if (onConflict) url.searchParams.set("on_conflict", onConflict);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...sbHeaders,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`Supabase upsert ${table}: ${res.status} ${await res.text()}`);
  }
}

// ── Anthropic ─────────────────────────────────────────────────────
const MODEL = "claude-haiku-4-5-20251001";
const API_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_INTERVAL_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function namespaceHash(value) {
  return createHash("sha1").update(JSON.stringify(value ?? null)).digest("hex");
}

function buildPrompt(kindLabel, targetLocale, productNameForContext, payload) {
  const localeName = LOCALE_NAME[targetLocale] || targetLocale;
  const contextLine = productNameForContext
    ? `Source ${kindLabel} (English name, do NOT translate): "${productNameForContext}"`
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
    `8. CRITICAL: Do not place any straight ASCII double-quote character (") inside string values — straight quotes break JSON. If a translation needs quotation marks around a phrase, use curly Unicode quotes appropriate to the target language: « » for French, „ " (U+201E + U+201C) for German/Polish, " " for English/Spanish/Italian/Portuguese, 「 」 for asian languages. If unsure, omit inner quotation marks entirely — most copy reads fine without them.`,
    `9. If a field is null or empty in the source, return null/empty for that field in the output.`,
    ``,
    `Source object:`,
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

async function translateOne(kindLabel, targetLocale, productNameForContext, payload) {
  const body = {
    model: MODEL,
    max_tokens: 8192,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: buildPrompt(kindLabel, targetLocale, productNameForContext, payload),
      },
    ],
  };
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json = await res.json();
  const textBlock = (json.content || []).find((c) => c.type === "text");
  if (!textBlock) throw new Error("Anthropic response missing text content");

  let text = textBlock.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n/, "").replace(/\n?```$/, "").trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Translated payload was not valid JSON. First 400 chars: ${text.slice(0, 400)}\nParse: ${err.message}`
    );
  }
  // Sanity: same key set.
  const srcKeys = Object.keys(payload).sort();
  const outKeys = Object.keys(parsed).sort();
  if (JSON.stringify(srcKeys) !== JSON.stringify(outKeys)) {
    throw new Error(
      `Key mismatch. Expected ${srcKeys.join(",")}, got ${outKeys.join(",")}`
    );
  }
  return parsed;
}

// ── Backfill driver ───────────────────────────────────────────────
async function runKind(kindKey) {
  const cfg = KINDS[kindKey];
  console.log(`\n── ${cfg.label} (${kindKey}) ─────────────`);

  const rows = await sbSelect(cfg.sourceTable, {
    select: cfg.sourceColumns.join(","),
    filter: cfg.sourceFilter,
  });
  console.log(`  ${rows.length} source rows`);

  // Pre-fetch all existing translations to support diff-aware skipping.
  const existing = await sbSelect(cfg.translationsTable, {
    select: `${cfg.fkColumn},locale,source_hash,source`,
  });
  const existingMap = new Map();
  for (const r of existing) {
    existingMap.set(`${r[cfg.fkColumn]}__${r.locale}`, r);
  }

  let translated = 0;
  let skipped = 0;
  let humanSkipped = 0;
  let errors = 0;

  for (const row of rows) {
    // Build the payload of translatable fields only.
    const payload = {};
    for (const f of cfg.translatableFields) payload[f] = row[f] ?? null;
    const currentHash = namespaceHash(payload);
    const nameForContext = row.name ?? null;

    for (const target of targets) {
      const cacheKey = `${row.id}__${target}`;
      const ex = existingMap.get(cacheKey);

      if (ex?.source === "human") {
        humanSkipped++;
        continue;
      }
      if (!force && ex?.source_hash === currentHash) {
        skipped++;
        continue;
      }

      try {
        const translatedPayload = await translateOne(
          cfg.label,
          target,
          nameForContext,
          payload
        );
        await sbUpsert(
          cfg.translationsTable,
          [
            {
              [cfg.fkColumn]: row.id,
              locale: target,
              ...translatedPayload,
              source_hash: currentHash,
              source: "ai",
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: `${cfg.fkColumn},locale` }
        );
        translated++;
        process.stdout.write(".");
        await sleep(REQUEST_INTERVAL_MS);
      } catch (err) {
        errors++;
        process.stdout.write("X");
        console.error(`\n    ${row.id}/${target}: ${err.message}`);
      }
    }
  }

  console.log(
    `\n  → ${translated} translated, ${skipped} unchanged (hash match), ${humanSkipped} human-locked, ${errors} errors`
  );
}

// ── Main ──────────────────────────────────────────────────────────
(async () => {
  console.log(
    `Translating DB content via ${MODEL}` +
      (force ? "  [--force: ignore source hashes]" : "  [diff-aware]")
  );
  console.log(`Kinds:   ${kindsToRun.join(", ")}`);
  console.log(`Locales: ${targets.join(", ")}`);

  for (const k of kindsToRun) {
    try {
      await runKind(k);
    } catch (err) {
      console.error(`Kind ${k} failed: ${err.message}`);
      process.exitCode = 1;
    }
  }
})();
