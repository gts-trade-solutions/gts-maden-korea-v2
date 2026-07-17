import { scoreRating } from "@/lib/integrations/skinConcerns";

// Slim 0–100 severity track with the three guidance bands (Needs care / Fair /
// Good), tick dividers at the cutoffs (50, 75), and a marker at the score.
// Pure/server-renderable. Axis labels live in the shared legend, not here.
export function ScoreBar({ score01 }: { score01: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score01 * 100)));
  const rating = scoreRating(score01);
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full">
      <div className="absolute inset-0 flex">
        <div className="h-full w-1/2 bg-red-500/20" />
        <div className="h-full w-1/4 bg-amber-500/25" />
        <div className="h-full w-1/4 bg-emerald-500/25" />
      </div>
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/70" />
      <div className="absolute inset-y-0 left-3/4 w-px bg-white/70" />
      <div
        className="absolute top-1/2 -translate-y-1/2"
        style={{ left: `${pct}%` }}
      >
        <div
          className={`-ml-[3px] h-2.5 w-1.5 rounded-full ring-2 ring-white ${rating.barClass} shadow-sm`}
        />
      </div>
    </div>
  );
}

// Radial overall score. Colored by rating via currentColor (stroke inherits the
// rating text color). Pure/server-renderable.
export function OverallGauge({
  score01,
  size = 104,
}: {
  score01: number;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(score01 * 100)));
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const rating = scoreRating(score01);
  return (
    <div
      className={`relative ${rating.textClass}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {pct}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

// Compare track: two markers (A hollow, B filled) on the same band scale, with
// a connecting segment colored by direction (green = improved, red = worse).
// Higher score = better. Pure/server-renderable.
export function CompareBar({
  a,
  b,
}: {
  a: number | null;
  b: number | null;
}) {
  const aPct = a == null ? null : Math.max(0, Math.min(100, Math.round(a * 100)));
  const bPct = b == null ? null : Math.max(0, Math.min(100, Math.round(b * 100)));
  const improved = a != null && b != null ? b >= a : null;
  const lo = aPct != null && bPct != null ? Math.min(aPct, bPct) : null;
  const hi = aPct != null && bPct != null ? Math.max(aPct, bPct) : null;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full">
      <div className="absolute inset-0 flex">
        <div className="h-full w-1/2 bg-red-500/15" />
        <div className="h-full w-1/4 bg-amber-500/20" />
        <div className="h-full w-1/4 bg-emerald-500/20" />
      </div>
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/70" />
      <div className="absolute inset-y-0 left-3/4 w-px bg-white/70" />
      {/* direction segment */}
      {lo != null && hi != null ? (
        <div
          className={`absolute top-1/2 h-0.5 -translate-y-1/2 ${improved ? "bg-emerald-500" : "bg-red-500"}`}
          style={{ left: `${lo}%`, width: `${hi - lo}%` }}
        />
      ) : null}
      {/* A marker (before) — hollow */}
      {aPct != null ? (
        <div
          className="absolute top-1/2 -ml-1.5 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-slate-500 bg-white"
          style={{ left: `${aPct}%` }}
        />
      ) : null}
      {/* B marker (after) — filled */}
      {bPct != null ? (
        <div
          className={`absolute top-1/2 -ml-1.5 h-3 w-3 -translate-y-1/2 rounded-full ring-2 ring-white ${improved ? "bg-emerald-500" : "bg-red-500"}`}
          style={{ left: `${bPct}%` }}
        />
      ) : null}
    </div>
  );
}

// Shared cutoff legend (rendered once per results view).
export function ScoreLegend() {
  const items = [
    { c: "bg-red-500", t: "<50 Needs care" },
    { c: "bg-amber-500", t: "50–75 Fair" },
    { c: "bg-emerald-500", t: "75+ Good" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.t} className="inline-flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${i.c}`} />
          {i.t}
        </span>
      ))}
    </div>
  );
}
