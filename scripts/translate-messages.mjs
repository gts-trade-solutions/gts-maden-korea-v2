#!/usr/bin/env node
// scripts/translate-messages.mjs
//
// Translate the source UI message bundle (messages/en-IN.json) into
// every non-source locale using the Anthropic API.
//
// Why this exists:
//   - Single source of truth for English copy lives in en-IN.json.
//   - Re-running the script regenerates pl.json, vi.json, fr.json, …
//     so the moment someone edits the source bundle, a refresh keeps
//     all locales in lockstep.
//
// How to run (Windows PowerShell or bash, from repo root):
//
//   node scripts/translate-messages.mjs                # all locales, diff-aware
//   node scripts/translate-messages.mjs pl vi          # just these locales
//   node scripts/translate-messages.mjs --force        # full rebuild
//   node scripts/translate-messages.mjs --force pl     # full rebuild of pl
//
// Default mode (NO --force) is diff-aware. For each existing locale
// file we check each top-level namespace against the source on TWO
// axes:
//   1. Key shape — does the namespace have the same set of leaf
//      paths? Catches added/removed/renamed keys.
//   2. Source value hash — does the source content hash match the
//      hash stored when that namespace was last translated? Catches
//      English copy edits (you tightened a subtitle, swapped a CTA
//      label, etc.) so translations stay current.
//
// A namespace is re-translated if EITHER axis differs (or --force is
// passed). Otherwise it's skipped entirely — no API call.
//
// Per-locale, per-namespace source hashes live in
// `messages/.translation-state.json`. First run after upgrading the
// script seeds that file from current state (no extra API cost).
//
// Use --force to re-translate everything from scratch, e.g. when
// switching models for better quality.
//
// Reads ANTHROPIC_API_KEY from `.env` at the repo root. The .env file
// has some lines with unquoted spaces (addresses), so we parse only
// strict `KEY=value` lines and ignore the rest — bash chokes on
// those but our parser doesn't care.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ── Load ANTHROPIC_API_KEY from .env ──────────────────────────────
function loadEnvKey(name) {
  const envPath = join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) {
    throw new Error(`.env not found at ${envPath}`);
  }
  const raw = readFileSync(envPath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key !== name) continue;
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

const API_KEY = process.env.ANTHROPIC_API_KEY || loadEnvKey("ANTHROPIC_API_KEY");
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY missing (checked process.env and .env)");
  process.exit(1);
}

// ── Locale targets ────────────────────────────────────────────────
const SOURCE_LOCALE = "en-IN";
// Every locale we ship that isn't the source. Keep in sync with
// lib/locales.ts when adding new languages.
const ALL_TARGETS = ["en", "pl", "vi", "fr", "de", "es", "it", "pt"];

// Display-name table used in the per-locale prompt so Claude knows
// which natural language to translate into. Keep in sync with the
// names used in lib/locales.ts.
const LOCALE_NAME = {
  "en":    "English (generic, non-Indian markets)",
  "pl":    "Polish",
  "vi":    "Vietnamese",
  "fr":    "French (France)",
  "de":    "German (Germany)",
  "es":    "Spanish (Spain)",
  "it":    "Italian (Italy)",
  "pt":    "Portuguese (Portugal)",
};

// ── CLI arg parsing ───────────────────────────────────────────────
const args = process.argv.slice(2);
const force = args.includes("--force");
const requestedLocales = args.filter((a) => !a.startsWith("--"));
const targets =
  requestedLocales.length > 0
    ? requestedLocales.filter((l) => ALL_TARGETS.includes(l))
    : ALL_TARGETS;

if (targets.length === 0) {
  console.error("No valid target locales. Allowed:", ALL_TARGETS.join(", "));
  process.exit(1);
}

// ── Source bundle ─────────────────────────────────────────────────
const sourcePath = join(REPO_ROOT, "messages", `${SOURCE_LOCALE}.json`);
if (!existsSync(sourcePath)) {
  console.error(`Source bundle not found: ${sourcePath}`);
  process.exit(1);
}
const sourceRaw = readFileSync(sourcePath, "utf8");
const sourceJson = JSON.parse(sourceRaw);
// Re-stringified so the model sees consistent formatting, regardless
// of how the file is indented on disk.
const sourceStr = JSON.stringify(sourceJson, null, 2);

// ── Anthropic call ────────────────────────────────────────────────
// Haiku 4.5 chosen over Sonnet because:
//   (1) free-tier output rate limit is 8k/min, and Sonnet's longer
//       per-call output blows past it after one request,
//   (2) UI string translation doesn't need Sonnet-level reasoning —
//       Haiku produces idiomatic store copy reliably,
//   (3) Haiku is ~5x cheaper, which matters across 264 small calls
//       (33 namespaces × 8 locales) when re-running.
const MODEL = "claude-haiku-4-5-20251001";
const API_URL = "https://api.anthropic.com/v1/messages";
// Throttle between requests to stay under per-minute output-token
// limits even on cold rate-limit buckets.
const REQUEST_INTERVAL_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildPrompt(targetLocale, namespaceKey, namespaceValue) {
  const localeName = LOCALE_NAME[targetLocale] || targetLocale;
  const namespaceJson = JSON.stringify({ [namespaceKey]: namespaceValue }, null, 2);
  return [
    `You are translating a JSON message bundle namespace for the MadenKorea storefront, a Korean beauty e-commerce site headquartered in India.`,
    ``,
    `Source language: English (India).`,
    `Target language: ${localeName} (locale code: ${targetLocale}).`,
    `Namespace being translated: "${namespaceKey}".`,
    ``,
    `Rules — follow ALL of them:`,
    `1. Return STRICT JSON only. No markdown, no code fences, no commentary, no leading or trailing prose. The first character of your output must be "{" and the last must be "}".`,
    `2. Return a single object whose only top-level key is "${namespaceKey}". Preserve every nested key EXACTLY as written. Translate only the string values.`,
    `3. Preserve placeholders like {year}, {count}, {name} verbatim. Do not translate or move them.`,
    `4. Preserve ICU MessageFormat constructs like {count, plural, one {# item} other {# items}} — keep the structure intact but translate the visible text inside the braces according to the target language's plural rules. Polish uses one/few/many/other; Vietnamese collapses to other; French/Spanish/Italian/Portuguese/German use one/other.`,
    `5. Do NOT translate brand names, product names, or proper nouns: "MadenKorea", "K- PartnerUp", "K Plus", "K-beauty", "FAQ", "Google", "Facebook". Keep them in the original form.`,
    `6. Where the source uses sentence punctuation like an ellipsis (…) or trailing colon (:), match the convention naturally used in the target language.`,
    `7. Keep tone customer-friendly, concise, and consistent with retail e-commerce UI (think Sephora, Yves Rocher, Olive Young).`,
    `8. Do not add fields, remove fields, or reorder fields.`,
    `9. CRITICAL: Do not place any straight ASCII double-quote character (") inside string values — straight quotes terminate JSON strings. If a translation needs quotation marks around a phrase, use ONLY curly Unicode quotes — pick the pair customary for the target language: « » (French), „ " (German), „ " (Polish), “ ” (English, Spanish, Italian, Portuguese), 「 」 (asian). Critically: in German, "„" must be paired with "" (U+201C left double quotation mark), NOT with ASCII ". If unsure, omit the inner quotation marks entirely — most UI strings read fine without them.`,
    ``,
    `Source namespace:`,
    namespaceJson,
  ].join("\n");
}

async function translateNamespace(target, namespaceKey, namespaceValue) {
  // Per-namespace requests keep each round trip small. The influencer
  // namespace is ~200 keys / 10kB and Vietnamese expansion truncates
  // at 4096; 8192 leaves headroom for further growth without paying
  // for it on the small namespaces (they stop generating much sooner).
  const body = {
    model: MODEL,
    max_tokens: 8192,
    temperature: 0,
    messages: [
      { role: "user", content: buildPrompt(target, namespaceKey, namespaceValue) },
    ],
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 400)}`);
  }

  const json = await res.json();
  const textBlock = (json.content || []).find((c) => c.type === "text");
  if (!textBlock) {
    throw new Error("Anthropic response missing text content");
  }

  let text = textBlock.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n/, "").replace(/\n?```$/, "").trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    // Dump the full failing response to a debug file so we can see
    // beyond the inline 400-char preview (which hides actual issues
    // like mid-string truncation or stray escape sequences).
    const debugPath = join(REPO_ROOT, "messages", `_debug_${target}_${namespaceKey}.txt`);
    writeFileSync(debugPath, text, "utf8");
    throw new Error(
      `Translated namespace "${namespaceKey}" was not valid JSON for ${target}. Full response saved to ${debugPath}. Parse error: ${err.message}`
    );
  }

  if (!parsed || typeof parsed !== "object" || !(namespaceKey in parsed)) {
    throw new Error(
      `Translated payload for ${target}/${namespaceKey} missing the expected top-level key.`
    );
  }

  return parsed[namespaceKey];
}

/**
 * Returns a sorted list of dot-paths to every leaf in the object.
 * Used to detect when a namespace has gained, lost, or renamed keys
 * compared to the source.
 */
function leafPaths(obj, prefix = "") {
  if (typeof obj !== "object" || obj === null) {
    return [prefix];
  }
  const paths = [];
  for (const k of Object.keys(obj)) {
    paths.push(...leafPaths(obj[k], prefix ? `${prefix}.${k}` : k));
  }
  return paths.sort();
}

function namespaceNeedsUpdate(srcVal, existingVal) {
  if (!existingVal || typeof existingVal !== "object") return true;
  const srcPaths = leafPaths(srcVal);
  const existingPaths = leafPaths(existingVal);
  return JSON.stringify(srcPaths) !== JSON.stringify(existingPaths);
}

function readExistingLocale(outPath) {
  if (!existsSync(outPath)) return null;
  try {
    const raw = readFileSync(outPath, "utf8").trim();
    if (!raw || raw === "{}" || raw === "{ }") return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Canonical JSON stringify + sha1. Recursively sorts keys at every
// depth so cosmetic reordering doesn't trigger spurious re-translations
// but ANY value change does. The previous implementation passed a
// top-level key array as `JSON.stringify`'s replacer argument, which
// produced canonical forms like `{"passwordReset":{}}` — same hash
// regardless of inner text — silently skipping retranslation when only
// inner copy changed.
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}
function namespaceHash(value) {
  return createHash("sha1").update(stableStringify(value)).digest("hex");
}

const STATE_PATH = join(REPO_ROOT, "messages", ".translation-state.json");

function readTranslationState() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeTranslationState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function translateLocale(target, opts) {
  const { outPath, force, state } = opts;
  const existing = readExistingLocale(outPath) ?? {};
  const localeState = state[target] ?? {};

  let translated = 0;
  let skipped = 0;

  const out = { ...existing };
  const nextLocaleState = {};

  for (const namespaceKey of Object.keys(sourceJson)) {
    const sourceValue = sourceJson[namespaceKey];
    const currentHash = namespaceHash(sourceValue);
    const storedHash = localeState[namespaceKey];

    const keyShapeChanged = namespaceNeedsUpdate(sourceValue, existing[namespaceKey]);
    const valueDrifted = storedHash !== undefined && storedHash !== currentHash;

    const needsUpdate = force || keyShapeChanged || valueDrifted;

    if (needsUpdate) {
      out[namespaceKey] = await translateNamespace(target, namespaceKey, sourceValue);
      translated++;
      await sleep(REQUEST_INTERVAL_MS);
    } else {
      skipped++;
    }

    // Always record the current source hash — even on skip — so the
    // first run after upgrading the script seeds state cleanly and
    // future runs detect value edits.
    nextLocaleState[namespaceKey] = currentHash;
  }

  // Drop any namespaces that no longer exist in source.
  for (const k of Object.keys(out)) {
    if (!(k in sourceJson)) delete out[k];
  }

  // Persist updated state for this locale.
  state[target] = nextLocaleState;

  return { out, translated, skipped };
}

// ── Main loop ─────────────────────────────────────────────────────
(async () => {
  console.log(
    `Translating ${SOURCE_LOCALE} → ${targets.join(", ")} via ${MODEL}` +
      (force ? " [--force: full rebuild]" : " [diff-aware: only changed namespaces]")
  );

  const state = readTranslationState();

  for (const target of targets) {
    const outPath = join(REPO_ROOT, "messages", `${target}.json`);
    process.stdout.write(`  • ${target}: `);
    try {
      const { out, translated, skipped } = await translateLocale(target, {
        outPath,
        force,
        state,
      });
      writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
      if (translated === 0) {
        console.log(`up to date (${skipped} namespaces unchanged)`);
      } else {
        console.log(`${translated} translated, ${skipped} unchanged`);
      }
    } catch (err) {
      console.log("FAILED");
      console.error(`    ${err.message}`);
      process.exitCode = 1;
    }
  }

  // Persist updated source-hash state so the next run can detect
  // value drift on namespaces edited between runs.
  writeTranslationState(state);
})();
