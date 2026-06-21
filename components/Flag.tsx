// Tiny country-flag image. Renders an actual flag PNG from flagcdn.com
// instead of relying on the OS emoji font — Windows doesn't include
// glyphs for regional-indicator pairs, so "🇮🇳" otherwise shows as the
// letters "IN", which collides with our adjacent country-code label.
//
// Using a plain <img> rather than next/image: the asset is ~700 bytes,
// already CDN-cached by flagcdn, and skipping the Next optimiser keeps
// remotePatterns config and bundle imports out of the picture.

interface FlagProps {
  /** ISO-3166-1 alpha-2 country code (e.g. "IN", "US"). Case-insensitive. */
  code: string;
  /** Width in px. Height is derived from the 4:3 flagcdn aspect. */
  width?: number;
  className?: string;
  /** Optional override; otherwise screen readers get "<CODE> flag". */
  alt?: string;
}

export function Flag({ code, width = 20, className, alt }: FlagProps) {
  const lower = code.toLowerCase();
  // flagcdn.com offers fixed pixel widths: 16, 20, 24, 32, 40, 48, 60, 80, 120, 160, 240, 320.
  // 20px reads cleanly inline at default text sizes; 40 is the @2x for HiDPI.
  const src1x = `https://flagcdn.com/w${width}/${lower}.png`;
  const src2x = `https://flagcdn.com/w${width * 2}/${lower}.png`;
  const height = Math.round(width * 0.75);

  return (
    <img
      src={src1x}
      srcSet={`${src1x} 1x, ${src2x} 2x`}
      width={width}
      height={height}
      alt={alt ?? `${code.toUpperCase()} flag`}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}
