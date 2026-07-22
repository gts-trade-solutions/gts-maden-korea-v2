"use client";

import Link from "next/link";
import { ArrowLeft, Download, ShoppingBag, Sparkles } from "lucide-react";
import {
  concernLabel,
  concernDescription,
  scoreRating,
} from "@/lib/integrations/skinConcerns";
import { ScoreBar } from "@/components/skin/score-visuals";
import { SkinProfileDashboard } from "@/components/skin/SkinProfileDashboard";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { resolveMediaUrl } from "@/lib/storage/backend";

type Concern = { key: string; score: number; imageUrl: string | null };
type ProductData = {
  id: string;
  slug: string;
  name: string;
  hero_image_path: string | null;
  price: number | null;
  sale_price: number | null;
  compare_at_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
};

/**
 * Printable skin analysis report. Viewable in-app and "Download PDF" via the
 * browser's print-to-PDF (same approach as the invoices — no PDF dependency).
 */
export function SkinReport({
  analysisId,
  dateLabel,
  userName,
  baseImage,
  overall,
  skinType,
  skinAge,
  aiSummary,
  concerns,
  concernSummaries,
  recommendations,
  recoReasons,
}: {
  analysisId: string;
  /** Pre-formatted on the server — formatting a date here would render
   *  differently on the server than in the browser (locale) and break hydration. */
  dateLabel: string;
  userName: string | null;
  baseImage: string | null;
  overall: number | null;
  skinType: string | null;
  skinAge: string | null;
  aiSummary: string | null;
  concerns: Concern[];
  /** AI one-liner per concern key (may be empty if generation degraded). */
  concernSummaries: Record<string, string>;
  recommendations: Record<string, ProductData[]>;
  /** AI "why this product" blurb for each concern's hero product (may be empty). */
  recoReasons: Record<string, string>;
}) {
  const overallRating = overall != null ? scoreRating(overall) : null;

  // Shared summary block — placed beside the photo on desktop/print, but
  // full-width below the photo on mobile (where a side column is too narrow).
  const summaryBlock = aiSummary ? (
    <div className="rounded-lg bg-muted/50 p-3 text-[13px] leading-relaxed sm:text-sm print:bg-transparent print:px-0">
      <span className="mr-1.5 inline-flex items-center gap-1 align-middle text-[11px] font-semibold uppercase tracking-wide text-rose-500">
        <Sparkles className="h-3 w-3" /> Summary
      </span>
      {aiSummary}
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-muted/30 py-6 print:bg-white print:py-0">
      {/* Toolbar — hidden when printing */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/account/skin-analysis/${analysisId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to result
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Download className="mr-2 h-4 w-4" /> Download PDF
        </Button>
      </div>

      {/* Document */}
      {/* Width stays the same in print: the chart is sized by measuring this
          container, and it would not re-measure before the print snapshot. */}
      <div className="mx-auto max-w-3xl bg-white p-5 shadow-sm sm:p-8 print:p-8 print:shadow-none">
        <header className="flex items-start justify-between gap-3 border-b pb-5 sm:gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">
              MadeNKorea
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              Skin Analysis Report
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {userName ? `${userName} · ` : ""}
              {dateLabel}
            </p>
          </div>
          {overall != null ? (
            <div className="shrink-0 text-right">
              <div
                className={`text-3xl font-bold tabular-nums sm:text-4xl ${overallRating?.textClass}`}
              >
                {Math.round(overall * 100)}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                / 100 · {overallRating?.label}
              </div>
            </div>
          ) : null}
        </header>

        {/* At a glance */}
        <section className="mt-6 break-inside-avoid">
          <div className="flex gap-4 sm:gap-5">
            {baseImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={baseImage}
                alt="Analyzed photo"
                className="h-32 w-24 shrink-0 rounded-lg object-cover sm:h-40 sm:w-32"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {skinType ? <Meta label="Skin type" value={cap(skinType)} /> : null}
                {skinAge ? <Meta label="Skin age" value={String(skinAge)} /> : null}
                <Meta label="Concerns analysed" value={String(concerns.length)} />
              </div>
              {/* Beside the photo on wide screens / print only. */}
              {summaryBlock ? (
                <div className="mt-3 hidden sm:block">{summaryBlock}</div>
              ) : null}
            </div>
          </div>
          {/* Full-width beneath the photo on mobile, where a side column is
              too cramped to read comfortably. */}
          {summaryBlock ? (
            <div className="mt-4 sm:hidden">{summaryBlock}</div>
          ) : null}
        </section>

        {/* Skin profile — infographic dashboard (gauge + iconified radar +
            insights + band cards) */}
        <section className="mt-8">
          <SkinProfileDashboard overall={overall} concerns={concerns} />
        </section>

        {/* Detailed analysis — one block per concern: score, AI summary, and
            (for recommendation-eligible concerns) its matched products. */}
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Detailed analysis
          </h2>
          <div className="divide-y">
            {concerns.map((c) => {
              const r = scoreRating(c.score);
              const items = recommendations[c.key] ?? [];
              const line = concernSummaries[c.key];
              const hero = items[0];
              const rest = items.slice(1);
              const reason = recoReasons[c.key];
              return (
                <div key={c.key} className="break-inside-avoid py-4">
                  <div className="flex gap-4">
                    {/* This concern's overlay image (the analyzed area for
                        this specific concern). Not every concern has one. */}
                    {c.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.imageUrl}
                        alt={`${concernLabel(c.key)} detail`}
                        className="h-32 w-24 shrink-0 rounded-lg object-cover sm:h-40 sm:w-32"
                      />
                    ) : null}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {concernLabel(c.key)}
                          </div>
                          {concernDescription(c.key) ? (
                            <div className="text-xs text-muted-foreground">
                              {concernDescription(c.key)}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-baseline gap-2">
                          <span
                            className={`text-base font-semibold tabular-nums ${r.textClass}`}
                          >
                            {Math.round(c.score * 100)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.chipClass}`}
                          >
                            {r.label}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2">
                        <ScoreBar score01={c.score} />
                      </div>

                      {line ? (
                        <p className="mt-2.5 text-[13px] leading-relaxed text-slate-700">
                          {line}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {hero ? (
                    <div className="mt-3">
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-500">
                        <ShoppingBag className="h-3 w-3" /> Recommended for this
                      </div>

                      {/* Hero product — the top pick, with an AI "why it fits"
                          blurb naming the product, and a larger card. */}
                      <HeroProduct
                        product={hero}
                        reason={reason}
                        concernLabel={concernLabel(c.key)}
                      />

                      {/* Remaining picks, shown as-is. */}
                      {rest.length ? (
                        <div className="mt-3">
                          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            More options
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {rest.map((p) => (
                              <ReportProduct key={p.slug} product={p} />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <footer className="mt-10 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">
          For cosmetic guidance only — not a medical diagnosis. Generated by the
          MadeNKorea AI Skin Analyzer on {dateLabel}.
        </footer>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function ReportProduct({ product }: { product: ProductData }) {
  const { formatPrice } = useCurrency();
  const img = product.hero_image_path
    ? (resolveMediaUrl("product-media", product.hero_image_path) ?? null)
    : null;
  const price = product.sale_price ?? product.price;
  return (
    <div className="flex gap-2 rounded-lg border p-2">
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt=""
          className="h-12 w-12 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded bg-muted" />
      )}
      <div className="min-w-0">
        <div className="line-clamp-2 text-[11px] font-medium leading-tight">
          {product.name}
        </div>
        {price != null ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formatPrice(price)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HeroProduct({
  product,
  reason,
  concernLabel,
}: {
  product: ProductData;
  reason?: string;
  concernLabel: string;
}) {
  const { formatPrice } = useCurrency();
  const img = product.hero_image_path
    ? (resolveMediaUrl("product-media", product.hero_image_path) ?? null)
    : null;
  const price = product.sale_price ?? product.price;
  const blurb =
    reason ?? `Our top pick for your ${concernLabel.toLowerCase()}.`;
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 print:bg-rose-50/50">
      <p className="mb-3 text-[13px] leading-relaxed text-slate-700">
        {highlightName(blurb, product.name)}
      </p>
      <Link
        href={`/products/${product.slug}`}
        className="flex items-center gap-3"
      >
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-lg bg-muted" />
        )}
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            <Sparkles className="h-2.5 w-2.5" /> Best match
          </span>
          <div className="mt-1 text-sm font-semibold leading-tight text-slate-900">
            {product.name}
          </div>
          {price != null ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {formatPrice(price)}
            </div>
          ) : null}
        </div>
      </Link>
    </div>
  );
}

// Bold the product's name where it appears in the AI blurb.
function highlightName(text: string, name: string) {
  if (!name) return text;
  const idx = text.toLowerCase().indexOf(name.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-slate-900">
        {text.slice(idx, idx + name.length)}
      </span>
      {text.slice(idx + name.length)}
    </>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
