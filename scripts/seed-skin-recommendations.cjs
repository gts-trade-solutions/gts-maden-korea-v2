/**
 * Seed skin concern → product recommendations by keyword-matching published
 * products against each concern. Deterministic and idempotent (upserts), so it
 * can be re-run safely and the admin can refine the results afterward at
 * /admin/skin-analysis/recommendations.
 *
 * Usage:  node scripts/seed-skin-recommendations.cjs [--dry]
 *
 * Matching: each product's (name + short_description + key_benefits +
 * ingredients) is lowercased and scanned for each concern's keywords. Products
 * with the most keyword hits rank first; up to MAX_PER_CONCERN are linked.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DRY = process.argv.includes("--dry");
const MAX_PER_CONCERN = 6;
// Every concern must end up with at least this many products so the report
// never shows an empty recommendations section. Concerns without enough direct
// keyword matches are topped up from RELATED concern pools below.
const MIN_PER_CONCERN = 3;

// When a concern has too few direct matches, borrow the best products from
// these related concerns (in order). Chosen by skincare adjacency — e.g. eye
// bags borrow firming + soothing products; tear troughs borrow hydrating +
// firming; droopy eyelids borrow firming + anti-wrinkle.
const RELATED = {
  acne: ["oiliness", "pores", "redness"],
  wrinkles: ["firmness", "texture"],
  pores: ["oiliness", "texture"],
  texture: ["radiance", "pores"],
  redness: ["moisture", "acne"],
  oiliness: ["pores", "acne"],
  moisture: ["redness", "radiance"],
  radiance: ["age_spot", "moisture"],
  firmness: ["wrinkles", "radiance"],
  dark_circle: ["radiance", "moisture"],
  eye_bag: ["firmness", "redness", "moisture"],
  tear_trough: ["moisture", "firmness"],
  droopy_upper_eyelid: ["firmness", "wrinkles"],
  droopy_lower_eyelid: ["firmness", "wrinkles"],
  age_spot: ["radiance", "moisture"],
};

// concern key → keywords that imply the product helps that concern.
// Kept intentionally specific to avoid noisy matches from generic words
// ("cream", "essence", "serum", "mask" are deliberately NOT keywords).
const KEYWORDS = {
  acne: ["acne", "blemish", "breakout", "pimple", "tea tree", "salicylic", "bha", "trouble", "clarify", "purify", "anti-blemish"],
  wrinkles: ["wrinkle", "anti-aging", "anti aging", "antiaging", "retinol", "bakuchiol", "peptide", "collagen", "fine line", "rejuven", "renewal", "adenosine"],
  pores: ["pore", "blackhead", "refin", "balancing toner", "clay", "peeling", "niacinamide", "sebum"],
  texture: ["texture", "exfoliat", "peeling", "aha", "pha", "smooth", "resurfac", "polish", "rejuven", "dead skin", "retinol"],
  redness: ["soothing", "calming", "cica", "centella", "sensitive", "panthenol", "b5", "snail", "mucin", "recovery", "relief", "comfort", "aloe", "barrier"],
  oiliness: ["oil control", "oily", "sebum", "mattif", "balancing", "cleansing foam", "cleansing mist", "cleanser", "foam"],
  moisture: ["hydra", "moistur", "moisture", "hyaluronic", "aqua", "dewy", "nourish", "barrier", "ceramide", "booster shot", "snail", "mucin"],
  radiance: ["bright", "glow", "luminos", "radian", "vitamin c", "tone up", "tone-up", "whiten", "brighten", "glass skin", "corrector", "niacinamide", "illuminat", "arbutin", "tranexamic"],
  firmness: ["firm", "lifting", "collagen", "elasticity", "peptide", "tighten", "bounce", "lift", "pdrn", "sculpt"],
  dark_circle: ["dark circle", "under-eye", "under eye", "undereye", "eye cream", "eye serum"],
  eye_bag: ["eye bag", "puffiness", "depuff", "caffeine", "eye cream", "eye serum"],
  tear_trough: ["under-eye", "hollow", "eye cream", "eye serum"],
  droopy_upper_eyelid: ["eyelid", "eye lift", "eye cream"],
  droopy_lower_eyelid: ["eyelid", "eye lift", "eye cream"],
  age_spot: ["dark spot", "age spot", "pigment", "melasma", "brighten", "corrector", "vitamin c", "whiten", "spf", "sunscreen", "sun block", "sun plus", "exo-bright", "luminos", "arbutin", "tranexamic"],
};

function textFor(p) {
  let kb = "";
  try {
    kb = Array.isArray(p.key_benefits) ? p.key_benefits.join(" ") : "";
  } catch {}
  // Deliberately excludes ingredients_md: INCI lists contain ubiquitous terms
  // (aqua/water, glycerin, niacinamide, collagen…) that match almost every
  // concern and drown the real signal. Name + marketing copy is what maps to a
  // concern intent.
  return [p.name, p.short_description, kb]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreProduct(text, keywords) {
  let score = 0;
  for (const kw of keywords) if (text.includes(kw)) score += 1;
  return score;
}

async function main() {
  const products = await prisma.products.findMany({
    where: { is_published: true, deleted_at: null },
    select: { id: true, name: true, short_description: true, key_benefits: true, ingredients_md: true },
  });
  console.log(`Scanning ${products.length} published products…\n`);

  const prepared = products.map((p) => ({ p, text: textFor(p) }));
  const concernKeys = Object.keys(KEYWORDS);

  // Pass 1 — direct keyword ranking per concern (full list, not yet capped).
  const primary = {}; // concern → [{ p, score }] sorted best-first
  for (const concern of concernKeys) {
    primary[concern] = prepared
      .map(({ p, text }) => ({ p, score: scoreProduct(text, KEYWORDS[concern]) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  }

  // Pass 2 — assemble final list per concern: direct matches first, then top
  // up sparse concerns from RELATED pools so none stays below MIN_PER_CONCERN.
  let linkTotal = 0;
  for (const concern of concernKeys) {
    const chosen = [];
    const seen = new Set();
    const take = (p, tag) => {
      if (seen.has(p.id) || chosen.length >= MAX_PER_CONCERN) return;
      seen.add(p.id);
      chosen.push({ p, tag });
    };

    for (const { p } of primary[concern].slice(0, MAX_PER_CONCERN)) take(p, "direct");

    if (chosen.length < MIN_PER_CONCERN) {
      for (const rel of RELATED[concern] ?? []) {
        for (const { p } of primary[rel] ?? []) {
          if (chosen.length >= MIN_PER_CONCERN) break;
          take(p, `related:${rel}`);
        }
        if (chosen.length >= MIN_PER_CONCERN) break;
      }
    }

    const directN = chosen.filter((c) => c.tag === "direct").length;
    console.log(
      `${concern.padEnd(20)} ${chosen.length} (${directN} direct${chosen.length > directN ? `, ${chosen.length - directN} related` : ""}): ${chosen.map((c) => c.p.name.slice(0, 30)).join(", ")}`,
    );

    if (DRY || !chosen.length) continue;

    await prisma.skinConcernSetting.upsert({
      where: { concernType: concern },
      update: { enabled: true },
      create: { concernType: concern, enabled: true, threshold: 0.6 },
    });

    // Authoritative rebuild: clear this concern's existing links and re-insert
    // the chosen set with clean positions 0..N. This keeps the hero (position 0)
    // deterministic and avoids position collisions from re-runs / prior seeds.
    await prisma.skinConcernProduct.deleteMany({ where: { concernType: concern } });
    let position = 0;
    for (const { p } of chosen) {
      await prisma.skinConcernProduct.create({
        data: { concernType: concern, productId: p.id, position },
      });
      position += 1;
      linkTotal += 1;
    }
  }

  console.log(
    `\n${DRY ? "[dry run] would link" : "Linked"} ${linkTotal} concern→product pairs across ${concernKeys.length} concerns.`,
  );
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
