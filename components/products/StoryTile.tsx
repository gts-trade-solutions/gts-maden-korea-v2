"use client";

import Image from "next/image";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { storyMediaUrl } from "@/lib/storyMediaUrl";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import type {
  StoryBlock,
  StoryBlockSize,
  TextPosition,
  TextSize,
  SplitDirection,
  StatsItem,
} from "@/lib/types/productStory";

const POS_CLASSES: Record<TextPosition, string> = {
  "top-left": "items-start justify-start text-left",
  "top-center": "items-center justify-start text-center",
  "top-right": "items-end justify-start text-right",
  "middle-left": "items-start justify-center text-left",
  "middle-center": "items-center justify-center text-center",
  "middle-right": "items-end justify-center text-right",
  "bottom-left": "items-start justify-end text-left",
  "bottom-center": "items-center justify-end text-center",
  "bottom-right": "items-end justify-end text-right",
};

export function textAlignFromPosition(
  pos: TextPosition | null | undefined
): string {
  if (!pos) return "text-left";
  if (pos.endsWith("-center")) return "text-center";
  if (pos.endsWith("-right")) return "text-right";
  return "text-left";
}

function scrimClass(textColor: string | null | undefined, pos: TextPosition): string {
  const v = pos.split("-")[0] as "top" | "middle" | "bottom";
  // Treat the legacy 'dark' enum keyword as the only "needs white scrim"
  // case. Everything else (legacy 'light', custom hex, null) gets the
  // dark scrim, which is more forgiving across arbitrary text colors.
  const useWhiteScrim = textColor === "dark";
  if (!useWhiteScrim) {
    if (v === "top")
      return "bg-gradient-to-b from-black/55 via-black/15 to-transparent";
    if (v === "bottom")
      return "bg-gradient-to-t from-black/55 via-black/15 to-transparent";
    return "bg-gradient-to-r from-black/35 via-black/10 to-transparent";
  }
  if (v === "top")
    return "bg-gradient-to-b from-white/55 via-white/15 to-transparent";
  if (v === "bottom")
    return "bg-gradient-to-t from-white/55 via-white/15 to-transparent";
  return "bg-gradient-to-r from-white/40 via-white/15 to-transparent";
}

function splitClasses(dir: SplitDirection): {
  outer: string;
  imageOrder: string;
  textOrder: string;
} {
  switch (dir) {
    case "image-left":
      return { outer: "grid grid-cols-2", imageOrder: "order-1", textOrder: "order-2" };
    case "image-right":
      return { outer: "grid grid-cols-2", imageOrder: "order-2", textOrder: "order-1" };
    case "image-top":
      return { outer: "grid grid-rows-2", imageOrder: "order-1", textOrder: "order-2" };
    case "image-bottom":
      return { outer: "grid grid-rows-2", imageOrder: "order-2", textOrder: "order-1" };
  }
}

function isLegacyDark(c: string | null | undefined): boolean {
  return c === "dark";
}

function textColorClass(c: string | null | undefined): string {
  // For the legacy enum we keep utility classes (lets Tailwind's
  // text-shadow / drop-shadow defaults stick). For free-form colors
  // we apply via inline style upstream and skip the class.
  if (!c || c === "light") return "text-white";
  if (c === "dark") return "text-neutral-900";
  return ""; // free-form color → handled via style prop
}

export function inlineTextColor(
  c: string | null | undefined
): React.CSSProperties | undefined {
  if (!c) return { color: "#ffffff" };
  if (c === "light") return { color: "#ffffff" };
  if (c === "dark") return { color: "#0a0a0a" };
  if (/^#[0-9a-fA-F]{3,8}$/.test(c) || /^[a-z]+\(/.test(c)) return { color: c };
  return undefined;
}

export function inlineBgColor(
  c: string | null | undefined
): React.CSSProperties | undefined {
  if (!c) return undefined;
  if (/^#[0-9a-fA-F]{3,8}$/.test(c) || /^[a-z]+\(/.test(c))
    return { backgroundColor: c };
  return undefined;
}

/**
 * Resolve a CSS-color string from a stored value:
 *   - hex / rgb() / hsl() pass through
 *   - 'light' / 'dark' map to defaults
 *   - null/undefined → null
 */
function resolveCssColor(c: string | null | undefined): string | null {
  if (!c) return null;
  if (c === "light") return "#ffffff";
  if (c === "dark") return "#0a0a0a";
  if (/^#[0-9a-fA-F]{3,8}$/.test(c) || /^[a-z]+\(/.test(c)) return c;
  return null;
}

/**
 * Returns true when the stored colour is a light shade (so we should
 * darken behind it, not lighten). Cheap luminance check.
 */
function isLightishColor(c: string | null | undefined): boolean {
  // Default text is white, default bg therefore should be dark.
  const resolved = resolveCssColor(c);
  if (!resolved) return true; // assume light text → dark backdrop
  // Hex parse (3 or 6 digit). Other CSS forms fall back to "light".
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(resolved);
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(resolved);
  let r = 255;
  let g = 255;
  let b = 255;
  if (m6) {
    r = parseInt(m6[1].slice(0, 2), 16);
    g = parseInt(m6[1].slice(2, 4), 16);
    b = parseInt(m6[1].slice(4, 6), 16);
  } else if (m3) {
    r = parseInt(m3[1][0] + m3[1][0], 16);
    g = parseInt(m3[1][1] + m3[1][1], 16);
    b = parseInt(m3[1][2] + m3[1][2], 16);
  } else {
    return true;
  }
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5;
}

function hexToRgbTuple(hex: string): [number, number, number] | null {
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(hex);
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (m6) {
    return [
      parseInt(m6[1].slice(0, 2), 16),
      parseInt(m6[1].slice(2, 4), 16),
      parseInt(m6[1].slice(4, 6), 16),
    ];
  }
  if (m3) {
    return [
      parseInt(m3[1][0] + m3[1][0], 16),
      parseInt(m3[1][1] + m3[1][1], 16),
      parseInt(m3[1][2] + m3[1][2], 16),
    ];
  }
  return null;
}

function rgbaFromColor(c: string, alpha: number): string {
  const tuple = hexToRgbTuple(c);
  if (tuple) return `rgba(${tuple[0]},${tuple[1]},${tuple[2]},${alpha})`;
  // Already an rgb()/hsl() — wrap in a transparency overlay via colour-mix
  // would be ideal but support is patchy. Just return the colour and accept
  // it'll behave like the original opaque value for non-hex inputs.
  return c;
}

/**
 * Build a bottom-anchored gradient sweep used by every overlay-text
 * scope (hero / feature Mode A / image caption / comparison caption).
 * Honours the author's `text_bg` when set; otherwise picks a tint
 * based on whether the chosen text colour is light or dark.
 *
 * Stays translucent throughout — the bottom stop is faintly tinted
 * for legibility and the top is fully transparent. The tile's image
 * remains visible through the entire overlay.
 */
/**
 * Map the stored `text_weight` keyword to a Tailwind `font-*` class.
 * Defaults to `font-bold` so legacy rows render exactly as v8.
 */
export function weightClass(
  block: StoryBlock | { text_weight?: string | null }
): string {
  switch (block.text_weight) {
    case "light":
      return "font-light";
    case "normal":
      return "font-normal";
    case "medium":
      return "font-medium";
    case "semibold":
      return "font-semibold";
    case "extrabold":
      return "font-extrabold";
    case "bold":
    default:
      return "font-bold";
  }
}

/**
 * Layered text-shadow for caption / overlay text. Always applied on
 * top of the image so glyphs read against busy backgrounds without
 * requiring a painted backdrop.
 *   - 1px crisp dark/light outline traces the glyphs
 *   - 8px soft halo provides ambient separation
 */
export function textShadowFor(block: StoryBlock): string {
  const textIsLight = isLightishColor(block.text_color);
  if (textIsLight) {
    return "0 0 1px rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,0.55)";
  }
  return "0 0 1px rgba(255,255,255,0.95), 0 2px 8px rgba(255,255,255,0.55)";
}

/**
 * Optional frosted backdrop directly behind the caption / headline
 * glyphs only. Triggered by `caption_backdrop=true`. Applied via
 * `box-decoration-clone` so each wrapped line gets its own pill,
 * keeping the rest of the image clean.
 */
export function glyphBackdropClass(block: StoryBlock): string {
  if (!block.caption_backdrop) return "";
  const textIsLight = isLightishColor(block.text_color);
  return cn(
    "box-decoration-clone px-2 py-0.5 rounded backdrop-blur-md",
    textIsLight ? "bg-black/35" : "bg-white/55"
  );
}

export function gradientOverlayStyle(
  block: StoryBlock
): { background: string } {
  const bgRaw = resolveCssColor(block.text_bg);
  if (bgRaw) {
    // Author-set bg → very translucent tint of that colour, fully gone
    // by the top so the image stays the dominant surface.
    const bottom = rgbaFromColor(bgRaw, 0.32);
    const mid = rgbaFromColor(bgRaw, 0.1);
    const top = rgbaFromColor(bgRaw, 0);
    return {
      background: `linear-gradient(to top, ${bottom} 0%, ${mid} 60%, ${top} 100%)`,
    };
  }
  // No author bg: barely-there tint chosen to keep contrast without
  // washing the image. Light text → faint dark wash; dark text →
  // faint light wash.
  const textIsLight = isLightishColor(block.text_color);
  const top = textIsLight ? "rgba(0,0,0,0)" : "rgba(255,255,255,0)";
  const mid = textIsLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)";
  const bottom = textIsLight
    ? "rgba(0,0,0,0.22)"
    : "rgba(255,255,255,0.32)";
  return {
    background: `linear-gradient(to top, ${bottom} 0%, ${mid} 60%, ${top} 100%)`,
  };
}

// ── Universal type-scale helpers (driven by text_size) ──────────────
// Each kind picks a tier so the same text_size feels right in context.
// Headlines lean larger; bodies one step smaller; captions another step.

function headlineClass(size: TextSize): string {
  switch (size) {
    case "sm":
      return "text-lg md:text-xl font-bold leading-tight";
    case "md":
      return "text-2xl md:text-3xl font-bold leading-tight";
    case "lg":
      return "text-3xl md:text-4xl font-bold leading-tight";
    case "xl":
      return "text-4xl md:text-5xl font-bold leading-tight";
    case "2xl":
      return "text-5xl md:text-6xl font-bold leading-tight";
  }
}

function bodyClass(size: TextSize): string {
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

function captionClass(size: TextSize): string {
  switch (size) {
    case "sm":
      return "text-[10px] md:text-xs";
    case "md":
      return "text-xs md:text-sm";
    case "lg":
      return "text-sm md:text-base";
    case "xl":
      return "text-base md:text-lg";
    case "2xl":
      return "text-lg md:text-xl";
  }
}

function statValueClass(size: TextSize): string {
  switch (size) {
    case "sm":
      return "text-2xl md:text-3xl";
    case "md":
      return "text-3xl md:text-4xl";
    case "lg":
      return "text-4xl md:text-5xl";
    case "xl":
      return "text-5xl md:text-6xl";
    case "2xl":
      return "text-6xl md:text-7xl";
  }
}

function statLabelClass(size: TextSize): string {
  switch (size) {
    case "sm":
      return "text-[10px] md:text-xs";
    case "md":
      return "text-xs md:text-sm";
    case "lg":
      return "text-sm md:text-base";
    case "xl":
      return "text-base md:text-lg";
    case "2xl":
      return "text-lg md:text-xl";
  }
}

function imageSizesForSize(size: StoryBlockSize): string {
  // Grid lives inside max-w-screen-xl (~1280px). Approximate the cell
  // share at desktop, fall back to viewport at mobile.
  switch (size) {
    case "1x1":
      return "(min-width: 1280px) 320px, (min-width: 768px) 25vw, 100vw";
    case "2x1":
    case "2x2":
      return "(min-width: 1280px) 640px, (min-width: 768px) 50vw, 100vw";
    case "1x2":
      return "(min-width: 1280px) 320px, (min-width: 768px) 25vw, 100vw";
    case "4x1":
      return "(min-width: 1280px) 1280px, 100vw";
  }
}

function statsColClass(count: number): string {
  if (count <= 2) return "grid-cols-2";
  if (count <= 4) return "grid-cols-2 md:grid-cols-4";
  return "grid-cols-2 md:grid-cols-3";
}

type Props = {
  block: StoryBlock;
  /** When true, this tile is rendered inside the editor preview frame. */
  preview?: boolean;
  /** When set, image gets next/image priority + fetchPriority="high". */
  priority?: boolean;
  /** When provided, the tile becomes clickable and opens the lightbox. */
  onExpand?: (block: StoryBlock) => void;
};

export function StoryTile({ block, preview = false, priority = false, onExpand }: Props) {
  const clickable = !!onExpand;
  const isComparison = block.block_type === "comparison";

  const inner = renderInner(block, priority);

  // Comparison tile must NOT be a whole-tile button: the slider needs
  // its own pointer events. Render a dedicated Expand button overlay
  // instead so the user can choose to enlarge it without their drag
  // gestures triggering the lightbox.
  if (isComparison) {
    return (
      <div
        className={cn(
          "group relative h-full w-full overflow-hidden rounded-xl border bg-card shadow-sm",
          preview && "shadow-none"
        )}
      >
        {inner}
        {clickable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand!(block);
            }}
            className={cn(
              "absolute right-2 top-2 z-20 inline-flex h-9 w-9 items-center justify-center rounded-md",
              "bg-black/55 text-white backdrop-blur transition-all duration-200 hover:bg-black/80 hover:scale-110",
              "opacity-80 [@media(hover:hover)]:motion-safe:group-hover:opacity-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            )}
            aria-label="Expand comparison"
            title="Expand"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  }

  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onExpand!(block)}
        className={cn(
          "group relative h-full w-full overflow-hidden rounded-xl border bg-card text-left shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          "transition-shadow hover:shadow-md"
        )}
        aria-label={`Open ${block.headline ?? block.block_type} story tile`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "group relative h-full w-full overflow-hidden rounded-xl border bg-card shadow-sm",
        preview && "shadow-none"
      )}
    >
      {inner}
    </div>
  );
}

function renderInner(block: StoryBlock, priority: boolean) {
  switch (block.block_type) {
    case "hero":
      return <HeroOrFeatureModeA block={block} variant="hero" priority={priority} />;
    case "feature":
      if (block.mode === "B")
        return <FeatureModeB block={block} priority={priority} />;
      return (
        <HeroOrFeatureModeA block={block} variant="feature" priority={priority} />
      );
    case "image":
      return <ImageBlock block={block} priority={priority} />;
    case "stats":
      return <StatsBlock block={block} />;
    case "comparison":
      return <ComparisonBlock block={block} priority={priority} />;
    default:
      return null;
  }
}

function focalPosition(
  fx: number | null | undefined,
  fy: number | null | undefined
): string {
  const x = typeof fx === "number" ? Math.max(0, Math.min(100, fx)) : 50;
  const y = typeof fy === "number" ? Math.max(0, Math.min(100, fy)) : 50;
  return `${x}% ${y}%`;
}

function objectFitClass(fit: string | null | undefined): string {
  switch (fit) {
    case "contain":
      return "object-contain";
    case "fill":
      return "object-fill";
    case "original":
      return "object-contain";
    case "cover":
    default:
      return "object-cover";
  }
}

function ImageOrPlaceholder({
  block,
  size,
  priority = false,
}: {
  block: StoryBlock;
  size: StoryBlockSize;
  priority?: boolean;
}) {
  const url = storyMediaUrl(block.image_path);
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
        No image
      </div>
    );
  }

  const fit = block.image_fit ?? "cover";
  const zoom =
    fit === "cover" && typeof block.image_zoom === "number"
      ? Math.max(1, Math.min(3, block.image_zoom))
      : 1;
  const objectPosition = focalPosition(block.image_focal_x, block.image_focal_y);
  const bg = block.image_bg ?? null;

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden",
        // Subtle hover-zoom on tiles whose ancestor opted in via the
        // `group` class. Gated by hover-capable + reduced-motion so
        // touch devices and motion-sensitive users opt out.
        "transition-transform duration-500 ease-out",
        "[@media(hover:hover)]:motion-safe:group-hover:scale-[1.04]"
      )}
      style={inlineBgColor(bg)}
    >
      <Image
        src={url}
        alt={block.image_alt ?? ""}
        fill
        className={objectFitClass(fit)}
        sizes={imageSizesForSize(size)}
        priority={priority}
        fetchPriority={priority ? "high" : undefined}
        style={{
          objectPosition,
          ...(zoom !== 1
            ? { transform: `scale(${zoom})`, transformOrigin: objectPosition }
            : null),
        }}
      />
    </div>
  );
}

// Defaults so an unset text_size still produces the v1 visual scale.
function defaultTextSize(block: StoryBlock, fallback: TextSize): TextSize {
  return block.text_size ?? fallback;
}

function HeroOrFeatureModeA({
  block,
  variant,
  priority,
}: {
  block: StoryBlock;
  variant: "hero" | "feature";
  priority: boolean;
}) {
  const ts = defaultTextSize(block, variant === "hero" ? "xl" : "md");
  const hoverReveal = block.caption_mode === "hover";
  const align = textAlignFromPosition(block.text_position);
  const sweep = gradientOverlayStyle(block);

  return (
    <>
      <ImageOrPlaceholder
        block={block}
        size={block.size}
        priority={priority}
      />
      {/* Bottom-anchored gradient sweep — text rises out of the image
          rather than sitting on a flat scrim. Padding hugs the text so
          the strip is only a little taller than the content itself. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 flex flex-col items-stretch justify-end gap-1 px-4 pb-3 pt-6 md:px-6 md:pb-4 md:pt-8",
          align,
          "transition-opacity duration-300",
          hoverReveal &&
            "opacity-0 [@media(hover:hover)]:motion-safe:group-hover:opacity-100 motion-safe:group-focus-within:opacity-100"
        )}
        style={{
          background: sweep.background,
          ...inlineTextColor(block.text_color),
        }}
      >
        {block.headline ? (
          <h3 className={cn(headlineClass(ts), weightClass(block), "max-w-[95%]")}>
            <span
              className={glyphBackdropClass(block)}
              style={{ textShadow: textShadowFor(block) }}
            >
              {block.headline}
            </span>
          </h3>
        ) : null}
        {block.body ? (
          <p className={cn(bodyClass(ts), "max-w-[90%] opacity-95")}>
            <span
              className={glyphBackdropClass(block)}
              style={{ textShadow: textShadowFor(block) }}
            >
              {block.body}
            </span>
          </p>
        ) : null}
      </div>
    </>
  );
}

function FeatureModeB({
  block,
  priority,
}: {
  block: StoryBlock;
  priority: boolean;
}) {
  const dir: SplitDirection = block.split_direction ?? "image-left";
  const { outer, imageOrder, textOrder } = splitClasses(dir);
  const ts = defaultTextSize(block, "md");
  const align = textAlignFromPosition(block.text_position ?? "middle-left");

  return (
    <div className={cn("h-full w-full", outer)}>
      <div className={cn("relative", imageOrder)}>
        <ImageOrPlaceholder
          block={block}
          size={block.size}
          priority={priority}
        />
      </div>
      <div
        className={cn(
          "flex flex-col justify-center p-6 md:p-8",
          textOrder,
          align,
          textColorClass(block.text_color),
          !block.text_bg && (block.text_color === "light" ? "bg-neutral-900" : "bg-card")
        )}
        style={{
          ...inlineTextColor(block.text_color),
          ...inlineBgColor(block.text_bg),
        }}
      >
        {block.headline ? (
          <h3 className={cn(headlineClass(ts), weightClass(block))}>
            {block.headline}
          </h3>
        ) : null}
        {block.body ? (
          <p
            className={cn(
              bodyClass(ts),
              "mt-2",
              !inlineTextColor(block.text_color) &&
                (block.text_color === "light"
                  ? "text-white/80"
                  : "text-muted-foreground")
            )}
            style={inlineTextColor(block.text_color) ? { opacity: 0.85 } : undefined}
          >
            {block.body}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ImageBlock({
  block,
  priority,
}: {
  block: StoryBlock;
  priority: boolean;
}) {
  const hasCaption = !!block.caption?.trim();
  const ts = defaultTextSize(block, "md");
  const align = textAlignFromPosition(block.text_position);
  const hoverReveal = block.caption_mode === "hover";
  const sweep = gradientOverlayStyle(block);

  if (!hasCaption) {
    return (
      <ImageOrPlaceholder
        block={block}
        size={block.size}
        priority={priority}
      />
    );
  }

  // v6: gradient-sweep caption overlay anchored to the bottom of the
  // image. Always-mode shows it at rest with subtle opacity; hover-mode
  // fades it in. Honours author's text_color and text_bg via inline
  // styles so the picker drives the visible result directly.
  return (
    <>
      <ImageOrPlaceholder
        block={block}
        size={block.size}
        priority={priority}
      />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end px-3 pb-2 pt-4 transition-opacity duration-200",
          captionClass(ts),
          align,
          hoverReveal
            ? "opacity-0 [@media(hover:hover)]:motion-safe:group-hover:opacity-100 motion-safe:group-focus-within:opacity-100"
            : "opacity-95 [@media(hover:hover)]:motion-safe:group-hover:opacity-100"
        )}
        style={{
          background: sweep.background,
          ...inlineTextColor(block.text_color),
        }}
      >
        <span
          className={glyphBackdropClass(block)}
          style={{ textShadow: textShadowFor(block) }}
        >
          {block.caption}
        </span>
      </div>
    </>
  );
}

function StatsBlock({ block }: { block: StoryBlock }) {
  const items: StatsItem[] = Array.isArray(block.stats_items)
    ? block.stats_items.filter(
        (it): it is StatsItem =>
          !!it && typeof it === "object" && "label" in it && "value" in it
      )
    : [];

  if (items.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
        Add at least one stat to display this block.
      </div>
    );
  }

  const ts = defaultTextSize(block, "md");
  const align = textAlignFromPosition(block.text_position ?? "middle-center");

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col p-5 md:p-8",
        !block.text_bg &&
          (block.text_color === "light"
            ? "bg-neutral-900 text-white"
            : "bg-muted text-foreground")
      )}
      style={{
        ...inlineTextColor(block.text_color),
        ...inlineBgColor(block.text_bg),
      }}
    >
      {block.headline ? (
        <h3 className={cn("mb-4", headlineClass(ts), weightClass(block), align)}>
          {block.headline}
        </h3>
      ) : null}
      <dl
        className={cn(
          "grid flex-1 items-center gap-4 md:gap-6",
          statsColClass(items.length)
        )}
      >
        {items.map((it, i) => (
          <div key={i} className={cn("text-center", align)}>
            <dt className="sr-only">{it.label}</dt>
            <dd
              className={cn(
                statValueClass(ts),
                weightClass(block),
                "leading-none origin-center transition-transform duration-300 ease-out",
                "[@media(hover:hover)]:motion-safe:group-hover:scale-[1.05]"
              )}
            >
              {it.value}
            </dd>
            <div
              className={cn(
                "mt-1 opacity-75",
                statLabelClass(ts),
                !inlineTextColor(block.text_color) &&
                  (block.text_color === "light"
                    ? "text-white/70"
                    : "text-muted-foreground")
              )}
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

function ComparisonBlock({
  block,
  priority,
}: {
  block: StoryBlock;
  priority: boolean;
}) {
  const before = storyMediaUrl(block.before_image_path);
  const after = storyMediaUrl(block.after_image_path);
  const caption = block.comparison_caption?.trim();
  const ts = defaultTextSize(block, "md");
  const align = textAlignFromPosition(block.text_position ?? "bottom-left");

  const sweep = gradientOverlayStyle(block);
  const captionEl = caption ? (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end px-3 pb-2 pt-4 opacity-95 transition-opacity duration-200",
        "[@media(hover:hover)]:motion-safe:group-hover:opacity-100",
        captionClass(ts),
        align
      )}
      style={{
        background: sweep.background,
        ...inlineTextColor(block.text_color),
      }}
    >
      <span
        className={glyphBackdropClass(block)}
        style={{ textShadow: textShadowFor(block) }}
      >
        {caption}
      </span>
    </div>
  ) : null;

  if (!before || !after) {
    const onlyOne = before || after;
    if (!onlyOne) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
          Add both before & after images for the slider.
        </div>
      );
    }
    return (
      <>
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src={onlyOne}
            alt={before ? "Before" : "After"}
            fill
            className="object-cover"
            sizes={imageSizesForSize(block.size)}
            priority={priority}
            fetchPriority={priority ? "high" : undefined}
          />
        </div>
        {captionEl}
      </>
    );
  }

  return (
    <>
      <div className="absolute inset-0 overflow-hidden">
        <BeforeAfterSlider beforeUrl={before} afterUrl={after} />
      </div>
      {captionEl}
    </>
  );
}

export function aspectClassForSize(size: StoryBlockSize): string {
  switch (size) {
    case "1x1":
      return "aspect-square";
    case "2x1":
      return "aspect-[2/1]";
    case "1x2":
      return "aspect-[1/2]";
    case "2x2":
      return "aspect-square";
    case "4x1":
      return "aspect-[4/1]";
  }
}

export function gridSpanClassForSize(size: StoryBlockSize): string {
  switch (size) {
    case "1x1":
      return "md:col-span-1 md:row-span-1";
    case "2x1":
      return "md:col-span-2 md:row-span-1";
    case "1x2":
      return "md:col-span-1 md:row-span-2";
    case "2x2":
      return "md:col-span-2 md:row-span-2";
    case "4x1":
      return "md:col-span-4 md:row-span-1";
  }
}
