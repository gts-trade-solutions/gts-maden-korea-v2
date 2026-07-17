"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { Images, ShoppingBag, Sparkles } from "lucide-react";
import {
  concernLabel,
  concernDescription,
  scoreRating,
} from "@/lib/integrations/skinConcerns";
import { ScoreBar, ScoreLegend } from "@/components/skin/score-visuals";
import { CompactProductCard } from "@/components/CompactProductCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * Image-first result view (stage + rail). The bottom of the photo is a
 * contextual panel: AI summary by default, a concern's products when its card
 * is tapped. Treatment concerns named in the AI summary are highlighted +
 * clickable → they open a modal listing that concern's suggested products.
 */
export function SkinResultView({
  baseImage,
  overall,
  skinType,
  skinAge,
  concerns,
  recommendations,
  aiSummary,
}: {
  baseImage: string | null;
  overall: number | null;
  skinType: string | null;
  skinAge: string | null;
  concerns: Concern[];
  recommendations: Record<string, ProductData[]>;
  aiSummary: string | null;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [modalConcern, setModalConcern] = useState<string | null>(null);
  const selConcern = sel ? concerns.find((c) => c.key === sel) : null;
  const shown = selConcern?.imageUrl ?? baseImage;
  const anyImages = concerns.some((c) => c.imageUrl);
  const overallRating = overall != null ? scoreRating(overall) : null;
  const recoCount = (key: string) => recommendations[key]?.length ?? 0;
  const toggle = (key: string) => setSel((s) => (s === key ? null : key));
  const selProducts = sel ? (recommendations[sel] ?? []) : [];

  // Concerns with product suggestions — highlighted in the AI summary.
  const treatmentConcerns = Object.keys(recommendations).map((k) => ({
    key: k,
    label: concernLabel(k),
  }));
  const modalProducts = modalConcern ? (recommendations[modalConcern] ?? []) : [];

  const contextual = sel ? (
    selProducts.length ? (
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
          <ShoppingBag className="h-3.5 w-3.5" />
          For your {concernLabel(sel).toLowerCase()} · {selProducts.length} pick
          {selProducts.length > 1 ? "s" : ""}
        </p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {selProducts.map((p) => (
            <MiniProduct key={p.slug} product={p} />
          ))}
        </div>
      </div>
    ) : (
      <p className="text-xs leading-relaxed text-white/90">
        <b>{concernLabel(sel)}</b>
        {concernDescription(sel) ? ` · ${concernDescription(sel)}` : ""} — tap
        again to clear
      </p>
    )
  ) : aiSummary ? (
    <p className="flex gap-2 text-xs leading-relaxed text-white/90">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/70" />
      <span>{highlightSummary(aiSummary, treatmentConcerns, setModalConcern)}</span>
    </p>
  ) : anyImages ? (
    <p className="text-[11px] text-white/70">
      Tap a concern to see it on your photo
    </p>
  ) : null;

  return (
    <>
      <div className="lg:flex lg:items-start lg:gap-6">
        {/* Stage */}
        <div className="lg:sticky lg:top-[var(--hdr)] lg:shrink-0 lg:self-start">
          <div className="relative mx-auto h-[calc(100dvh_-_var(--hdr)_-_4rem)] w-full overflow-hidden rounded-xl bg-muted lg:h-[calc(100dvh_-_var(--hdr)_-_2rem)] lg:aspect-[3/4] lg:w-auto">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shown}
                alt={sel ? `${concernLabel(sel)} overlay` : "Analyzed photo"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No photo
              </div>
            )}

            {/* Top metrics overlay */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent p-3 text-white">
              <div className="flex gap-2">
                {skinType ? <Pill label="Type" value={cap(skinType)} /> : null}
                {skinAge ? (
                  <Pill label="Skin age" value={String(skinAge)} />
                ) : null}
              </div>
              {overall != null ? (
                <div className="rounded-lg bg-black/40 px-2.5 py-1 text-right leading-none backdrop-blur">
                  <div className="text-xl font-semibold tabular-nums">
                    {Math.round(overall * 100)}
                  </div>
                  <div className="text-[9px] uppercase tracking-wide text-white/80">
                    {overallRating?.label}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Contextual bottom panel (+ concern chips on mobile) */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-12 text-white">
              {contextual ? (
                <div className="rounded-xl bg-black/60 p-3 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
                  {contextual}
                </div>
              ) : null}
              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 lg:hidden">
                {concerns.map((c) => {
                  const active = sel === c.key;
                  const n = recoCount(c.key);
                  const clickable = !!c.imageUrl || n > 0;
                  return (
                    <button
                      key={c.key}
                      disabled={!clickable}
                      onClick={() => toggle(c.key)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium backdrop-blur ${
                        active
                          ? "bg-white text-slate-900"
                          : "bg-black/50 text-white"
                      } ${clickable ? "" : "opacity-55"}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${scoreRating(c.score).barClass}`}
                      />
                      {concernLabel(c.key)}
                      <span className="tabular-nums opacity-80">
                        {Math.round(c.score * 100)}
                      </span>
                      {n > 0 ? (
                        <span className="flex items-center gap-0.5">
                          <ShoppingBag className="h-3 w-3" />
                          {n}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile legend */}
        <div className="mt-3 flex justify-center lg:hidden">
          <ScoreLegend />
        </div>

        {/* Rail — desktop concern list */}
        <div className="hidden lg:block lg:flex-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Concerns
            </h2>
            <ScoreLegend />
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {concerns.map((c) => {
              const rating = scoreRating(c.score);
              const active = sel === c.key;
              const n = recoCount(c.key);
              const clickable = !!c.imageUrl || n > 0;
              return (
                <button
                  key={c.key}
                  disabled={!clickable}
                  onClick={() => toggle(c.key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active ? "border-primary ring-1 ring-primary" : ""
                  } ${clickable ? "hover:bg-muted/40" : "cursor-default"}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1">
                      {c.imageUrl ? (
                        <Images
                          className={`h-3 w-3 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}
                        />
                      ) : null}
                      <span className="truncate text-xs font-medium">
                        {concernLabel(c.key)}
                      </span>
                    </span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${rating.textClass}`}
                    >
                      {Math.round(c.score * 100)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <ScoreBar score01={c.score} />
                  </div>
                  {n > 0 ? (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ShoppingBag className="h-3 w-3" />
                      {n} product{n > 1 ? "s" : ""} suggested
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Product modal (opened from a highlighted concern in the AI summary) */}
      <Dialog
        open={!!modalConcern}
        onOpenChange={(o) => {
          if (!o) setModalConcern(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Recommended for your{" "}
              {modalConcern ? concernLabel(modalConcern).toLowerCase() : ""}
            </DialogTitle>
          </DialogHeader>
          {modalProducts.length ? (
            <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
              {modalProducts.map((p) => (
                <CompactProductCard key={p.slug} product={p} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No products suggested yet.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Wrap treatment-concern names in the AI summary as clickable highlights.
function highlightSummary(
  text: string,
  concerns: { key: string; label: string }[],
  onClick: (key: string) => void,
): React.ReactNode {
  if (!concerns.length) return text;
  const byLen = [...concerns].sort((a, b) => b.label.length - a.label.length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b(${byLen.map((c) => esc(c.label)).join("|")})\\b`, "gi");
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const matched = m[0];
    const concern = byLen.find(
      (c) => c.label.toLowerCase() === matched.toLowerCase(),
    );
    if (concern) {
      out.push(
        <button
          key={`h${i++}`}
          onClick={() => onClick(concern.key)}
          className="rounded bg-white/25 px-1 font-semibold text-white underline decoration-white/60 underline-offset-2 hover:bg-white/35"
        >
          {matched}
        </button>,
      );
    } else {
      out.push(matched);
    }
    last = m.index + matched.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function MiniProduct({ product }: { product: ProductData }) {
  const { formatPrice } = useCurrency();
  const img = product.hero_image_path
    ? (resolveMediaUrl("product-media", product.hero_image_path) ?? null)
    : null;
  const price = product.sale_price ?? product.price;
  return (
    <Link
      href={`/products/${product.slug}`}
      className="flex w-44 shrink-0 items-center gap-2 rounded-lg bg-white p-2 text-slate-900 shadow-sm transition hover:bg-white/90"
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-11 w-11 shrink-0 rounded bg-slate-100" />
      )}
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium leading-tight">
          {product.name}
        </div>
        {price != null ? (
          <div className="mt-0.5 text-[11px] text-slate-600">
            {formatPrice(price)}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/40 px-2.5 py-1 leading-tight backdrop-blur">
      <div className="text-[9px] uppercase tracking-wide text-white/60">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
