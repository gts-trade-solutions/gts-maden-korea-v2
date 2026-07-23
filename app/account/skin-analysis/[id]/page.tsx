import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { SkinResultView } from "@/components/skin/SkinResultView";
import { ViewReportButton } from "@/components/skin/ViewReportButton";
import {
  META_KEYS,
  DEFAULT_RECO_THRESHOLD,
  type SkinSummary,
  type SkinIssueDetails,
} from "@/lib/integrations/skinConcerns";
import { generateSkinSummary } from "@/lib/integrations/skinSummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const iso = (d: Date | null | undefined): string | null =>
  d ? new Date(d).toISOString() : null;

export default async function SkinAnalysisDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/auth/login?redirect=/account/skin-analysis/${params.id}`);
  }

  const analysis = await prisma.skinAnalysis.findFirst({
    where: { id: params.id, userId: user.id },
    include: { issues: true },
  });
  if (!analysis) notFound();

  const summary = (analysis.summary as SkinSummary | null) ?? {};

  const prev = await prisma.skinAnalysis.findFirst({
    where: {
      userId: user.id,
      status: "done",
      createdAt: { lt: analysis.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  // Scored concerns, worst (lowest health) first.
  const concerns = analysis.issues
    .filter((i) => !META_KEYS.has(i.issueType) && i.score != null)
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

  const viewConcerns = concerns.map((c) => ({
    key: c.issueType,
    score: c.score ?? 0,
    imageUrl: (c.details as SkinIssueDetails | null)?.imageUrl ?? null,
  }));

  // ── Recommendations: concerns below their (admin) threshold ──
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

  const recos = new Map<string, any[]>();
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
          },
        })
      : [];
    const pMap = new Map(products.map((p) => [p.id, p]));
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
      if (items.length) recos.set(c.issueType, items);
    }
  }

  const recommendations: Record<string, any[]> = Object.fromEntries(recos);

  // AI summary — lazily generated once, then cached on the analysis row.
  let aiSummary = summary.ai_summary ?? null;
  if (!aiSummary && concerns.length) {
    const generated = await generateSkinSummary({
      overall: summary.overall ?? null,
      skinType: summary.skin_type ?? null,
      skinAge: summary.skin_age ?? null,
      concerns: viewConcerns.map((c) => ({ key: c.key, score: c.score })),
      treatmentKeys: Object.keys(recommendations),
    });
    if (generated) {
      aiSummary = generated;
      await prisma.skinAnalysis
        .update({
          where: { id: analysis.id },
          data: { summary: { ...summary, ai_summary: generated } as any },
        })
        .catch(() => {});
    }
  }

  return (
    <CustomerLayout>
      <div
        className="mx-auto max-w-6xl px-4 py-6"
        style={{ ["--hdr" as string]: "128px" } as React.CSSProperties}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Your skin analysis
            </h1>
            <p className="text-sm text-muted-foreground">
              {new Date(analysis.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Primary CTA — highlighted so users know the full report lives
                behind it, with an explicit loading state while the report
                generates (see ViewReportButton). */}
            <ViewReportButton
              href={`/account/skin-analysis/${analysis.id}/report`}
            />
            {prev ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/account/skin-analysis/compare?a=${prev.id}&b=${analysis.id}`}
                >
                  Compare
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href="/account/skin-analysis">All</Link>
            </Button>
          </div>
        </div>

        {/* Nudge reinforcing the CTA above. Icon aligns to the first line so it
            reads cleanly when the text wraps on mobile. */}
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Tap{" "}
            <span className="font-medium text-foreground">View full report</span>{" "}
            for your web chart, per-concern breakdown and a downloadable PDF.
          </p>
        </div>

        <SkinResultView
          baseImage={summary.base_image ?? null}
          overall={summary.overall ?? null}
          skinType={summary.skin_type ?? null}
          skinAge={summary.skin_age ?? null}
          concerns={viewConcerns}
          recommendations={recommendations}
          aiSummary={aiSummary}
        />

        <p className="mt-8 text-center text-xs text-muted-foreground">
          For cosmetic guidance only. Not a medical diagnosis.
        </p>
      </div>
    </CustomerLayout>
  );
}
