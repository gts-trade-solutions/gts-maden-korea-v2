// components/CountryFlag.tsx
//
// Renders a country flag as an SVG instead of relying on the Unicode
// regional-indicator emoji. Chrome on Windows ships without a flag
// emoji font, so `🇮🇳` falls back to rendering as the two letters "IN"
// — which looks like duplicated text when we put the flag emoji next
// to a country code label. SVGs render identically everywhere.
//
// Each supported country is imported explicitly (named import from
// `country-flag-icons/react/3x2`) so the bundler tree-shakes the
// ~240 countries we don't ship. Only the 15 below ride along, which
// works out to roughly 5 KB gzipped for the whole flag set.
//
// `code` is case-insensitive. Unknown codes render nothing (returns
// null) so callers can drop this component in without a guard.

import {
  IN,
  US,
  GB,
  PL,
  VN,
  TH,
  FR,
  DE,
  ES,
  IT,
  PT,
  ZA,
  TZ,
  NG,
  QA,
  AE,
  // Imports beyond SUPPORTED_COUNTRIES — needed because user-generated
  // data (reviews) carries country codes that aren't in the storefront's
  // supported list. AU and CA appear in seeded review data; JP/NL/SG/etc
  // were called out in earlier scoping work as "might come back" and
  // cost ~300 bytes each gzipped, so we include them defensively.
  AU,
  CA,
  JP,
  NL,
  SG,
} from "country-flag-icons/react/3x2";

// The library exports a `FlagComponent` type that's slightly looser
// than `React.FC<React.SVGProps<...>>`. Use `React.ComponentType<any>`
// so any signature drift between minor versions doesn't break compile.
const FLAG_COMPONENTS: Record<string, React.ComponentType<any>> = {
  IN,
  US,
  GB,
  PL,
  VN,
  TH,
  FR,
  DE,
  ES,
  IT,
  PT,
  ZA,
  TZ,
  NG,
  QA,
  AE,
  AU,
  CA,
  JP,
  NL,
  SG,
};

type Props = {
  code: string | null | undefined;
  /** Tailwind / CSS classes. Defaults to a chip-friendly inline size. */
  className?: string;
  /** Accessible name. Defaults to "Flag of <CODE>" via title attribute. */
  title?: string;
};

export function CountryFlag({ code, className, title }: Props) {
  if (!code) return null;
  const upper = code.toUpperCase();
  const Flag = FLAG_COMPONENTS[upper];
  if (!Flag) return null;
  return (
    <Flag
      // Default: inline-block, small, with a subtle border-radius so
      // it sits nicely next to text. Override via `className`.
      className={className ?? "inline-block h-3.5 w-auto rounded-[1px]"}
      title={title ?? `Flag of ${upper}`}
      aria-hidden="true"
    />
  );
}

export default CountryFlag;
