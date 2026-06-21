"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "../ProductCard";

type CardProduct = {
  id: string;
  slug: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  is_bundle?: boolean | null;
  new_until?: string | null;
  short_description?: string | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  hero_image_url?: string | null;
  hero_image_path?: string | null;
  brands?: { name?: string | null } | null;
};

interface EditorialSectionProps {
  title: string;
  description?: string;
  products: CardProduct[];
}

export function EditorialSection({
  title,
  description,
  products,
}: EditorialSectionProps) {
  const t = useTranslations("home");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  // Update edge state so chevrons hide when there's nowhere left to scroll.
  // Without this the user gets a chevron that does nothing at the ends.
  const syncEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    syncEdges();
    el.addEventListener("scroll", syncEdges, { passive: true });
    window.addEventListener("resize", syncEdges);
    return () => {
      el.removeEventListener("scroll", syncEdges);
      window.removeEventListener("resize", syncEdges);
    };
  }, [syncEdges, products.length]);

  // Page-step scroll: read one card's width from the DOM (incl. gap) and
  // advance/retreat by ~80% of the visible area for a comfortable jump
  // without skipping items the user hasn't seen yet.
  const scrollByPage = (dir: "prev" | "next") => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-card="true"]');
    const cardWidth = card?.getBoundingClientRect().width ?? el.clientWidth;
    const gap = parseFloat(getComputedStyle(el).gap || "0") || 0;
    const step = (cardWidth + gap) * Math.max(1, Math.floor(el.clientWidth / (cardWidth + gap)) - 1);
    el.scrollBy({ left: dir === "next" ? step : -step, behavior: "smooth" });
  };

  if (products.length === 0) return null;

  return (
    <section className="relative">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">{title}</h2>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>

      <div className="relative">
        {/* Scrollable row. Slot widths via the --slides CSS variable so the
            same markup renders 2-up on phones, 3-up on small tablets, 4 on
            desktop, 5 on wide desktops. Native scroll-snap keeps cards
            aligned without JS.
            Mobile uses 2.2 (not 2) so a sliver of the third card peeks
            past the right edge — visual affordance that the row is
            swipeable. The snap is still per-card, so every swipe
            advances exactly one product. */}
        <div
          ref={scrollRef}
          className="
            flex overflow-x-auto scrollbar-hide
            snap-x snap-mandatory [scroll-snap-stop:always]
            [--slide-gap:0.75rem] gap-[var(--slide-gap)]
            [--slides:2.2] sm:[--slides:3] md:[--slides:4] lg:[--slides:5]
            [scrollbar-width:none] [-ms-overflow-style:none]
            pb-1
          "
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              data-card="true"
              className="
                shrink-0 snap-start
                basis-[calc((100%_-_(var(--slide-gap)_*_(var(--slides)_-_1)))_/_var(--slides))]
                max-w-full
              "
            >
              <ProductCard product={product as any} />
            </div>
          ))}
        </div>

        {/* Desktop chevrons. Hidden on touch-only viewports where swipe is
            the natural affordance. Edge-aware: `canPrev`/`canNext` track
            scroll position so an unreachable chevron doesn't sit dimmed at
            the end of the row. */}
        {canPrev && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => scrollByPage("prev")}
            aria-label={t("scrollLeft")}
            className="hidden md:inline-flex absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/95 shadow hover:bg-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        {canNext && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => scrollByPage("next")}
            aria-label={t("scrollRight")}
            className="hidden md:inline-flex absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-white/95 shadow hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </div>
    </section>
  );
}
