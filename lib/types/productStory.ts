export type StoryBlockType = "hero" | "feature" | "stats" | "comparison" | "image";
export type StoryBlockSize = "1x1" | "2x1" | "1x2" | "2x2" | "4x1";
export type StoryBlockMode = "A" | "B" | "C";

export type TextPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type SplitDirection =
  | "image-left"
  | "image-right"
  | "image-top"
  | "image-bottom";

export type TextSize = "sm" | "md" | "lg" | "xl" | "2xl";

export type TextWeight =
  | "light"
  | "normal"
  | "medium"
  | "semibold"
  | "bold"
  | "extrabold";

export const TEXT_WEIGHTS: TextWeight[] = [
  "light",
  "normal",
  "medium",
  "semibold",
  "bold",
  "extrabold",
];

/** How the tile image fills its container. v3. */
export type ImageFit = "cover" | "contain" | "fill" | "original";

export const IMAGE_FITS: ImageFit[] = ["cover", "contain", "fill", "original"];

/**
 * v4 caption visibility mode. Only meaningful for text-on-image blocks
 * (hero, feature Mode A, image with caption). Stats and feature Mode B
 * silently ignore it.
 */
export type CaptionMode = "always" | "hover";

export const CAPTION_MODES: CaptionMode[] = ["always", "hover"];

export type StatsItem = { label: string; value: string };

/**
 * text_color accepts:
 *  - the v1 enum keywords "light" / "dark" (back-compat for older rows)
 *  - any CSS color string (hex, rgb(), hsl(), or named) for v2 free-form colors
 * The renderer treats unknown strings as CSS colors via inline style.
 */
export type TextColor = "light" | "dark" | (string & {});

export type StoryBlock = {
  id: string;
  product_id: string;
  position: number;
  block_type: StoryBlockType;
  size: StoryBlockSize;
  mode: StoryBlockMode;
  headline: string | null;
  body: string | null;
  text_position: TextPosition;
  text_color: TextColor;
  /** v2 free-form text background color (hex / css color). Null = legacy tinted defaults. */
  text_bg?: string | null;
  text_size: TextSize;
  /** v9: weight of headline / stats-value text. Defaults to 'bold'. */
  text_weight?: TextWeight | null;
  split_direction: SplitDirection;
  image_path: string | null;
  image_alt: string | null;
  caption: string | null;
  /** v2 focal point as percentage (0–100). Null = use default 50/50 (center). */
  image_focal_x?: number | null;
  image_focal_y?: number | null;
  /** v3 fit mode. Null/undefined = legacy 'cover'. */
  image_fit?: ImageFit | null;
  /** v3 cover-mode zoom (1.0–3.0). Null/undefined = 1 (no zoom). */
  image_zoom?: number | null;
  /** v3 background color shown around contain/original/fill empty space. Null = transparent. */
  image_bg?: string | null;
  /**
   * v4: when caption text is visible. Defaults to 'always' for
   * existing rows. Hover-mode applies only to hero / feature Mode A /
   * image-with-caption; other block types ignore it.
   */
  caption_mode?: CaptionMode | null;
  /**
   * v8: small frosted backdrop behind the caption / headline glyphs
   * only. Defaults to false. Layered text-shadow is always applied;
   * this opts in to an additional bounding-box backdrop for busy
   * images where text-shadow alone isn't enough.
   */
  caption_backdrop?: boolean | null;
  stats_items: StatsItem[] | null;
  before_image_path: string | null;
  after_image_path: string | null;
  comparison_caption: string | null;
  created_at: string;
  updated_at: string;
};

export const STORY_BLOCK_TYPES: StoryBlockType[] = [
  "hero",
  "feature",
  "stats",
  "comparison",
  "image",
];

export const STORY_BLOCK_SIZES: StoryBlockSize[] = [
  "1x1",
  "2x1",
  "1x2",
  "2x2",
  "4x1",
];

export const TEXT_POSITIONS: TextPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export const SPLIT_DIRECTIONS: SplitDirection[] = [
  "image-left",
  "image-right",
  "image-top",
  "image-bottom",
];

export const TEXT_SIZES: TextSize[] = ["sm", "md", "lg", "xl", "2xl"];
