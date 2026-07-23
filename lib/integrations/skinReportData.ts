import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  META_KEYS,
  DEFAULT_RECO_THRESHOLD,
  concernLabel,
  type SkinSummary,
  type SkinIssueDetails,
} from "@/lib/integrations/skinConcerns";
import {
  generatePerConcernSummaries,
  generateProductReasons,
} from "@/lib/integrations/skinSummary";

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const iso = (d: Date | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;

export type ReportConcern = {
  key: string;
  score: number;
  imageUrl: string | null;
};

export type ReportData = {
  analysisId: string;
  createdAt: Date;
  ownerUserId: string;
  summary: SkinSummary;
  concerns: ReportConcern[];
  concernSummaries: Record<string, string>;
  recommendations: Record<string, any[]>;
  recoReasons: Record<string, string>;
};

/**
 * Build everything the SkinReport component needs for one analysis:
 * worst-first concerns, per-concern product recommendations (below the admin
 * threshold), and the lazily-generated + cached AI copy (per-concern summaries
 * and hero "why this product" blurbs).
 *
 * Shared by the account report page (pass `ownerUserId` to scope to the signed
 * in user) and the admin report page (omit it to view any user's analysis).
 * Returns null when the analysis isn't found (or isn't owned by `ownerUserId`).
 */
export async function buildSkinReportData(
  analysisId: string,
  opts: { ownerUserId?: string } = {},
): Promise<ReportData | null> {
  const analysis = await prisma.skinAnalysis.findFirst({
    where: opts.ownerUserId
      ? { id: analysisId, userId: opts.ownerUserId }
      : { id: analysisId },
    include: { issues: true },
  });
  if (!analysis) return null;

  // Mutable so later cache writes (reco_reasons) spread the freshly-written
  // concern_summaries rather than the stale row value.
  let summary = (analysis.summary as SkinSummary | null) ?? {};

  // Worst first, so the report leads with what needs attention.
  const concerns = analysis.issues
    .filter((i) => !META_KEYS.has(i.issueType) && i.score != null)
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

  // ── Recommendations for concerns below their admin threshold ──
  const concernTypes = concerns.map((c) => c.issueType);
  const settings = concernTypes.length
    ? await prisma.skinConcernSetting.findMany({
        where: { concernType: { in: concernTypes } },
      })
    : [];
  const settingMap = new Map(settings.map((s) => [s.concernType, s]));

  const below = concerns.filter((c) => {
    const s = settingMap.get(c.issueType);
    if (s && !s.enabled) return false;
    const threshold = s?.threshold ?? DEFAULT_RECO_THRESHOLD;
    return (c.score ?? 1) < threshold;
  });

  const recommendations: Record<string, any[]> = {};
  // product id → short benefit text, for the hero "why" prompt.
  const benefitById = new Map<string, string>();
  if (below.length) {
    const maps = await prisma.skinConcernProduct.findMany({
      where: { concernType: { in: below.map((c) => c.issueType) } },
      orderBy: [{ concernType: "asc" }, { position: "asc" }],
    });
    const productIds = Array.from(new Set(maps.map((m) => m.productId)));
    const products = productIds.length
      ? await prisma.products.findMany({
          where: { id: { in: productIds }, is_published: true, deleted_at: null },
          select: {
            id: true,
            slug: true,
            name: true,
            hero_image_path: true,
            price: true,
            sale_price: true,
            compare_at_price: true,
            sale_starts_at: true,
            sale_ends_at: true,
            short_description: true,
            key_benefits: true,
          },
        })
      : [];
    const pMap = new Map(products.map((p) => [p.id, p]));
    for (const p of products) {
      let kb = "";
      try {
        kb = Array.isArray((p as any).key_benefits)
          ? (p as any).key_benefits.join(" ")
          : "";
      } catch {}
      const t = [(p as any).short_description, kb]
        .filter(Boolean)
        .join(" — ")
        .replace(/\s+/g, " ")
        .slice(0, 180);
      if (t) benefitById.set(p.id, t);
    }
    for (const c of below) {
      const items = maps
        .filter((m) => m.concernType === c.issueType)
        .map((m) => pMap.get(m.productId))
        .filter(Boolean)
        .map((p: any) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          hero_image_path: p.hero_image_path ?? null,
          price: num(p.price),
          sale_price: num(p.sale_price),
          compare_at_price: num(p.compare_at_price),
          sale_starts_at: iso(p.sale_starts_at),
          sale_ends_at: iso(p.sale_ends_at),
        }));
      if (items.length) recommendations[c.issueType] = items;
    }
  }

  // ── Per-concern AI summaries (one sentence each), lazily generated + cached ──
  const viewConcerns: ReportConcern[] = concerns.map((c) => ({
    key: c.issueType,
    score: c.score ?? 0,
    imageUrl: (c.details as SkinIssueDetails | null)?.imageUrl ?? null,
  }));
  let concernSummaries = summary.concern_summaries ?? null;
  if (!concernSummaries && viewConcerns.length) {
    const generated = await generatePerConcernSummaries({
      concerns: viewConcerns.map((c) => ({ key: c.key, score: c.score })),
      eligibleKeys: Object.keys(recommendations),
    });
    if (generated) {
      concernSummaries = generated;
      summary = { ...summary, concern_summaries: generated };
      await prisma.skinAnalysis
        .update({ where: { id: analysis.id }, data: { summary: summary as any } })
        .catch(() => {});
    }
  }

  // ── "Why this product" for each concern's HERO product (position 0) ──
  const scoreByKey = new Map(viewConcerns.map((c) => [c.key, c.score]));
  const cachedReasons = summary.reco_reasons ?? {};
  const recoReasons: Record<string, string> = {};
  const needReasons: {
    concernKey: string;
    concernLabel: string;
    score: number;
    productName: string;
    productBenefits: string;
  }[] = [];
  for (const [key, items] of Object.entries(recommendations)) {
    const hero = items[0];
    if (!hero) continue;
    const cached = cachedReasons[key];
    if (cached && cached.productId === hero.id && cached.text) {
      recoReasons[key] = cached.text;
    } else {
      needReasons.push({
        concernKey: key,
        concernLabel: concernLabel(key),
        score: scoreByKey.get(key) ?? 0,
        productName: hero.name,
        productBenefits: benefitById.get(hero.id) ?? "",
      });
    }
  }
  if (needReasons.length) {
    const generated = await generateProductReasons({ items: needReasons });
    if (generated) {
      const nextCache: Record<string, { productId: string; text: string }> = {
        ...cachedReasons,
      };
      for (const it of needReasons) {
        const text = generated[it.concernKey];
        if (!text) continue;
        recoReasons[it.concernKey] = text;
        const hero = recommendations[it.concernKey]?.[0];
        if (hero) nextCache[it.concernKey] = { productId: hero.id, text };
      }
      summary = { ...summary, reco_reasons: nextCache };
      await prisma.skinAnalysis
        .update({ where: { id: analysis.id }, data: { summary: summary as any } })
        .catch(() => {});
    }
  }

  return {
    analysisId: analysis.id,
    createdAt: analysis.createdAt,
    ownerUserId: analysis.userId,
    summary,
    concerns: viewConcerns,
    concernSummaries: concernSummaries ?? {},
    recommendations,
    recoReasons,
  };
}
