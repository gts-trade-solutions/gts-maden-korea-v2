"use client";

import { useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { storyMediaUrl } from "@/lib/storyMediaUrl";
import { cn } from "@/lib/utils";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import { ZoomableImage } from "./ZoomableImage";
import {
  glyphBackdropClass,
  inlineTextColor,
  textAlignFromPosition,
  textShadowFor,
  weightClass,
} from "./StoryTile";
import type {
  StoryBlock,
  StatsItem,
  TextSize,
} from "@/lib/types/productStory";

type Props = {
  block: StoryBlock | null;
  onOpenChange: (open: boolean) => void;
  /** Step ±1 through the surrounding tile list. Hidden when no neighbours. */
  onNavigate?: (direction: -1 | 1) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
};

function bumpedHeadline(size: TextSize): string {
  switch (size) {
    case "sm":
      return "text-xl md:text-2xl";
    case "md":
      return "text-2xl md:text-3xl";
    case "lg":
      return "text-3xl md:text-4xl";
    case "xl":
      return "text-4xl md:text-5xl";
    case "2xl":
      return "text-5xl md:text-6xl";
  }
}

function bumpedBody(size: TextSize): string {
  switch (size) {
    case "sm":
      return "text-sm md:text-base";
    case "md":
      return "text-base md:text-lg";
    case "lg":
      return "text-lg md:text-xl";
    case "xl":
      return "text-xl md:text-2xl";
    case "2xl":
      return "text-2xl md:text-3xl";
  }
}

function bumpedCaption(size: TextSize): string {
  switch (size) {
    case "sm":
      return "text-xs md:text-sm";
    case "md":
      return "text-sm md:text-base";
    case "lg":
      return "text-base md:text-lg";
    case "xl":
      return "text-lg md:text-xl";
    case "2xl":
      return "text-xl md:text-2xl";
  }
}

function bumpedStatValue(size: TextSize): string {
  switch (size) {
    case "sm":
      return "text-3xl md:text-4xl";
    case "md":
      return "text-4xl md:text-5xl";
    case "lg":
      return "text-5xl md:text-6xl";
    case "xl":
      return "text-6xl md:text-7xl";
    case "2xl":
      return "text-7xl md:text-8xl";
  }
}

function bumpedStatLabel(size: TextSize): string {
  switch (size) {
    case "sm":
      return "text-xs md:text-sm";
    case "md":
      return "text-sm md:text-base";
    case "lg":
      return "text-base md:text-lg";
    case "xl":
      return "text-lg md:text-xl";
    case "2xl":
      return "text-xl md:text-2xl";
  }
}

export function StoryTileExpanded({
  block,
  onOpenChange,
  onNavigate,
  hasPrev,
  hasNext,
}: Props) {
  const open = !!block;

  // Keyboard ← / → navigation while the lightbox is open.
  useEffect(() => {
    if (!open || !onNavigate) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).closest("[data-zoomable]"))
        return;
      if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        onNavigate(-1);
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        onNavigate(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onNavigate, hasPrev, hasNext]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/55 backdrop-blur-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "flex w-[min(95vw,1400px)] h-[min(90vh,900px)]",
            "rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10",
            "bg-black text-white outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            // 240 ms feels intentional but not slow.
            "duration-[240ms]"
          )}
          // Make the zoom pivot the centre of the dialog so it expands
          // outward symmetrically instead of from a corner.
          style={{ transformOrigin: "50% 50%" }}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {block?.headline ?? labelFor(block?.block_type) ?? "Story"}
          </DialogPrimitive.Title>

          {/* Floating close — top-right. */}
          <DialogPrimitive.Close
            className={cn(
              "absolute right-3 top-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-md",
              "bg-black/55 text-white shadow ring-1 ring-white/10 backdrop-blur",
              "transition-colors hover:bg-black/80",
              "focus:outline-none focus:ring-2 focus:ring-white/70"
            )}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          {/* Prev / Next nav arrows. */}
          {onNavigate && hasPrev ? (
            <button
              type="button"
              onClick={() => onNavigate(-1)}
              className={cn(
                "absolute left-3 top-1/2 z-30 -translate-y-1/2",
                "inline-flex h-11 w-11 items-center justify-center rounded-full",
                "bg-black/55 text-white shadow ring-1 ring-white/10 backdrop-blur",
                "transition-colors hover:bg-black/80",
                "focus:outline-none focus:ring-2 focus:ring-white/70"
              )}
              aria-label="Previous tile"
              title="Previous (← arrow key)"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}

          {onNavigate && hasNext ? (
            <button
              type="button"
              onClick={() => onNavigate(1)}
              className={cn(
                "absolute right-3 top-1/2 z-30 -translate-y-1/2",
                "inline-flex h-11 w-11 items-center justify-center rounded-full",
                "bg-black/55 text-white shadow ring-1 ring-white/10 backdrop-blur",
                "transition-colors hover:bg-black/80",
                "focus:outline-none focus:ring-2 focus:ring-white/70"
              )}
              aria-label="Next tile"
              title="Next (→ arrow key)"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : null}

          <main className="relative flex min-h-0 flex-1">
            {block ? <ExpandedBody block={block} /> : null}
          </main>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function labelFor(t: StoryBlock["block_type"] | undefined): string | null {
  if (!t) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function ExpandedBody({ block }: { block: StoryBlock }) {
  switch (block.block_type) {
    case "hero":
    case "feature":
      return <HeroOrFeatureExpanded block={block} />;
    case "image":
      return <ImageExpanded block={block} />;
    case "stats":
      return <StatsExpanded block={block} />;
    case "comparison":
      return <ComparisonExpanded block={block} />;
    default:
      return null;
  }
}

/**
 * Bottom-anchored text overlay for the lightbox. No painted backdrop —
 * the text rides directly over the image; readability comes from the
 * layered text-shadow on the glyphs themselves. Authors can opt into a
 * frosted backdrop on the text via `caption_backdrop`.
 */
function BottomGradientOverlay({
  block,
  children,
}: {
  block: StoryBlock;
  children: React.ReactNode;
}) {
  const align = textAlignFromPosition(block.text_position);
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end gap-1 px-6 pb-4 md:px-10 md:pb-5",
        align
      )}
      style={inlineTextColor(block.text_color)}
    >
      {children}
    </div>
  );
}

function HeroOrFeatureExpanded({ block }: { block: StoryBlock }) {
  const url = storyMediaUrl(block.image_path);
  const ts = block.text_size ?? (block.block_type === "hero" ? "xl" : "md");
  const hasText = !!(block.headline?.trim() || block.body?.trim());

  return (
    <div className="relative h-full w-full bg-black" data-zoomable>
      {url ? (
        <ZoomableImage src={url} alt={block.image_alt ?? ""} sizes="100vw" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
          No image
        </div>
      )}
      {hasText ? (
        <BottomGradientOverlay block={block}>
          {block.headline ? (
            <h2 className={cn(bumpedHeadline(ts), weightClass(block), "leading-tight")}>
              <span
                className={glyphBackdropClass(block)}
                style={{ textShadow: textShadowFor(block) }}
              >
                {block.headline}
              </span>
            </h2>
          ) : null}
          {block.body ? (
            <p className={cn(bumpedBody(ts), "mt-1 opacity-95")}>
              <span
                className={glyphBackdropClass(block)}
                style={{ textShadow: textShadowFor(block) }}
              >
                {block.body}
              </span>
            </p>
          ) : null}
        </BottomGradientOverlay>
      ) : null}
    </div>
  );
}

function ImageExpanded({ block }: { block: StoryBlock }) {
  const url = storyMediaUrl(block.image_path);
  const ts = block.text_size ?? "md";
  const hasCaption = !!block.caption?.trim();

  return (
    <div className="relative h-full w-full bg-black" data-zoomable>
      {url ? (
        <ZoomableImage src={url} alt={block.image_alt ?? ""} sizes="100vw" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
          No image
        </div>
      )}
      {hasCaption ? (
        <BottomGradientOverlay block={block}>
          <span
            className={cn(bumpedCaption(ts), glyphBackdropClass(block))}
            style={{ textShadow: textShadowFor(block) }}
          >
            {block.caption}
          </span>
        </BottomGradientOverlay>
      ) : null}
    </div>
  );
}

function StatsExpanded({ block }: { block: StoryBlock }) {
  const items: StatsItem[] = Array.isArray(block.stats_items)
    ? block.stats_items.filter(
        (it): it is StatsItem =>
          !!it && typeof it === "object" && "label" in it && "value" in it
      )
    : [];
  const ts = block.text_size ?? "md";
  const align = textAlignFromPosition(block.text_position ?? "middle-center");

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-y-auto p-8 md:p-16",
        block.text_color === "dark" ? "bg-muted text-foreground" : "bg-neutral-900 text-white"
      )}
      style={inlineTextColor(block.text_color)}
    >
      {block.headline ? (
        <h2
          className={cn(
            "mb-12 leading-tight",
            bumpedHeadline(ts),
            weightClass(block),
            align
          )}
        >
          {block.headline}
        </h2>
      ) : null}
      <dl
        className={cn(
          "grid flex-1 items-center gap-12",
          items.length <= 2
            ? "grid-cols-1 sm:grid-cols-2"
            : items.length <= 4
              ? "grid-cols-2 md:grid-cols-4"
              : "grid-cols-2 md:grid-cols-3"
        )}
      >
        {items.map((it, i) => (
          <div key={i} className={cn("text-center", align)}>
            <dt className="sr-only">{it.label}</dt>
            <dd
              className={cn(
                bumpedStatValue(ts),
                weightClass(block),
                "leading-none"
              )}
            >
              {it.value}
            </dd>
            <div
              className={cn("mt-3 opacity-75", bumpedStatLabel(ts))}
              aria-hidden="true"
            >
              {it.label}
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ComparisonExpanded({ block }: { block: StoryBlock }) {
  const before = storyMediaUrl(block.before_image_path);
  const after = storyMediaUrl(block.after_image_path);
  const caption = block.comparison_caption?.trim();
  const ts = block.text_size ?? "md";

  return (
    <div className="relative h-full w-full bg-black">
      {before && after ? (
        <BeforeAfterSlider beforeUrl={before} afterUrl={after} />
      ) : before || after ? (
        <Image
          src={(before || after) as string}
          alt={before ? "Before" : "After"}
          fill
          sizes="100vw"
          className="object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-white/70">
          Add both before & after images.
        </div>
      )}
      {caption ? (
        <BottomGradientOverlay block={block}>
          <span
            className={cn(bumpedCaption(ts), glyphBackdropClass(block))}
            style={{ textShadow: textShadowFor(block) }}
          >
            {caption}
          </span>
        </BottomGradientOverlay>
      ) : null}
    </div>
  );
}

export default StoryTileExpanded;
