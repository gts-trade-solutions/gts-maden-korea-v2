// K-Points brand mark — a gold coin with a "K" monogram. Replaces the generic
// lucide "Coins" icon everywhere K-Points appears. Size is controlled by the
// className (e.g. `h-4 w-4`); no fixed width/height so it scales like an icon.
//
// Gradient ids are static and identical across instances — duplicate ids in the
// DOM resolve to the first (identical) definition, so multiple coins on a page
// render correctly without needing per-instance ids (keeps it server-safe).
export function KCoin({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="kcoinFace" cx="34%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#FFF7CC" />
          <stop offset="42%" stopColor="#FBD24E" />
          <stop offset="82%" stopColor="#E8A21C" />
          <stop offset="100%" stopColor="#B7770D" />
        </radialGradient>
        <linearGradient id="kcoinRim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F6C24B" />
          <stop offset="100%" stopColor="#9A6206" />
        </linearGradient>
      </defs>

      {/* outer rim */}
      <circle cx="24" cy="24" r="23" fill="url(#kcoinRim)" />
      {/* coin face */}
      <circle
        cx="24"
        cy="24"
        r="19"
        fill="url(#kcoinFace)"
        stroke="#8A5A05"
        strokeWidth="1"
      />
      {/* engraved inner ring for depth */}
      <circle
        cx="24"
        cy="24"
        r="15.5"
        fill="none"
        stroke="#8A5A05"
        strokeOpacity="0.4"
        strokeWidth="1.2"
      />
      {/* K monogram */}
      <text
        x="24"
        y="25"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="21"
        fontWeight="800"
        fill="#8A5A05"
        fontFamily="ui-sans-serif, system-ui, Segoe UI, Roboto, sans-serif"
      >
        K
      </text>
      {/* top-left shine */}
      <ellipse cx="17" cy="14" rx="6.5" ry="3.6" fill="#FFFFFF" opacity="0.5" />
    </svg>
  );
}
