"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Images } from "lucide-react";
import { concernLabel } from "@/lib/integrations/skinConcerns";
import { CompareBar } from "@/components/skin/score-visuals";

type Concern = { key: string; score: number | null; imageUrl: string | null };
export type CompareSide = {
  id: string;
  dateLabel: string;
  baseImage: string | null;
  overall: number | null;
  concerns: Concern[];
};
type Option = { id: string; label: string };

/**
 * Compare two analyses.
 *
 * - Desktop: the two photos sit BIG on the left/right (sticky), with the
 *   comparison in the centre — using the horizontal space instead of wasting it.
 * - Mobile: photos stack small at the top of the centre column; tapping a
 *   concern scrolls them back into view.
 * - Tap a concern → both photos swap to that concern's overlay.
 */
export function CompareView({
  a,
  b,
  options,
}: {
  a: CompareSide;
  b: CompareSide;
  options: Option[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(null);
  const mobileImgsRef = useRef<HTMLDivElement>(null);

  const aMap = new Map(a.concerns.map((c) => [c.key, c]));
  const bMap = new Map(b.concerns.map((c) => [c.key, c]));
  const keys = Array.from(
    new Set([...a.concerns, ...b.concerns].map((c) => c.key)),
  );
  const rows = keys
    .map((key) => {
      const as = aMap.get(key)?.score ?? null;
      const bs = bMap.get(key)?.score ?? null;
      return {
        key,
        as,
        bs,
        delta: as != null && bs != null ? bs - as : null,
        hasImage: !!(aMap.get(key)?.imageUrl || bMap.get(key)?.imageUrl),
      };
    })
    .sort((x, y) => Math.abs(y.delta ?? -1) - Math.abs(x.delta ?? -1));

  const imgA = sel ? (aMap.get(sel)?.imageUrl ?? a.baseImage) : a.baseImage;
  const imgB = sel ? (bMap.get(sel)?.imageUrl ?? b.baseImage) : b.baseImage;
  const overallDelta =
    a.overall != null && b.overall != null ? b.overall - a.overall : null;

  function nav(next: { a?: string; b?: string }) {
    router.push(
      `/account/skin-analysis/compare?a=${next.a ?? a.id}&b=${next.b ?? b.id}`,
    );
  }
  function select(key: string) {
    const isActive = sel === key;
    setSel(isActive ? null : key);
    if (!isActive && typeof window !== "undefined" && window.innerWidth < 1024) {
      mobileImgsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const center = (
    <div className="space-y-5">
      {/* selectors */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <Selector label="Before" value={a.id} options={options} onChange={(id) => nav({ a: id })} />
        <span className="text-muted-foreground">→</span>
        <Selector label="After" value={b.id} options={options} onChange={(id) => nav({ b: id })} />
      </div>

      {/* Photos (mobile only — desktop shows them big on the sides) */}
      <div ref={mobileImgsRef} className="grid grid-cols-2 gap-3 lg:hidden">
        <Panel tag="Before" date={a.dateLabel} img={imgA} sel={sel} className="aspect-[3/4]" />
        <Panel tag="After" date={b.dateLabel} img={imgB} sel={sel} className="aspect-[3/4]" />
      </div>
      <p className="text-center text-xs text-muted-foreground lg:hidden">
        {sel ? (
          <>Showing <b>{concernLabel(sel)}</b> · tap its row again to clear</>
        ) : (
          <>Tap a concern to compare its overlay images</>
        )}
      </p>

      {/* overall */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <span className="text-sm font-medium">Overall</span>
        <div className="flex items-center gap-3 text-sm tabular-nums">
          <span>
            {a.overall != null ? Math.round(a.overall * 100) : "—"} →{" "}
            <b>{b.overall != null ? Math.round(b.overall * 100) : "—"}</b>
          </span>
          <DeltaChip delta={overallDelta} />
        </div>
      </div>

      {/* compare legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium">Concerns · biggest change first</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-slate-500 bg-white" />
            before
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            after
          </span>
        </span>
      </div>

      {/* concern rows (biggest change first) */}
      <div className="divide-y overflow-hidden rounded-lg border">
        {rows.map((r) => {
          const active = sel === r.key;
          return (
            <button
              key={r.key}
              disabled={!r.hasImage}
              onClick={() => select(r.key)}
              className={`flex w-full items-center gap-2 px-3 py-3 text-left sm:gap-3 ${r.hasImage ? "hover:bg-muted/50" : "cursor-default opacity-60"} ${active ? "bg-muted" : ""}`}
            >
              <Images
                className={`h-3.5 w-3.5 shrink-0 ${r.hasImage ? (active ? "text-primary" : "text-muted-foreground") : "text-transparent"}`}
              />
              <span className="w-20 shrink-0 truncate text-xs font-medium sm:w-28 sm:text-sm">
                {concernLabel(r.key)}
              </span>
              <div className="flex-1">
                <CompareBar a={r.as} b={r.bs} />
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {r.as != null ? Math.round(r.as * 100) : "—"}→
                {r.bs != null ? Math.round(r.bs * 100) : "—"}
              </span>
              <span className="w-12 shrink-0 text-right">
                <DeltaChip delta={r.delta} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[1fr_minmax(19rem,26rem)_1fr] lg:items-start lg:gap-5">
      {/* Big photo A — desktop only, left */}
      <div className="hidden lg:block lg:sticky lg:top-[var(--hdr)]">
        <Panel tag="Before" date={a.dateLabel} img={imgA} sel={sel} className="aspect-[3/4] max-h-[calc(100dvh_-_var(--hdr)_-_4.5rem)]" />
      </div>

      {center}

      {/* Big photo B — desktop only, right */}
      <div className="hidden lg:block lg:sticky lg:top-[var(--hdr)]">
        <Panel tag="After" date={b.dateLabel} img={imgB} sel={sel} className="aspect-[3/4] max-h-[calc(100dvh_-_var(--hdr)_-_4.5rem)]" />
      </div>
    </div>
  );
}

function Panel({
  tag,
  date,
  img,
  sel,
  className,
}: {
  tag: string;
  date: string;
  img: string | null;
  sel: string | null;
  className: string;
}) {
  return (
    <div>
      <p className="mb-1 truncate text-center text-xs font-medium text-muted-foreground">
        {tag} · {date}
        {sel ? ` · ${concernLabel(sel)}` : ""}
      </p>
      <div className={`relative mx-auto w-full overflow-hidden rounded-xl bg-muted ${className}`}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={tag} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>
    </div>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-xs text-muted-foreground">—</span>;
  const v = Math.round(delta * 100);
  if (v === 0) return <span className="text-xs text-muted-foreground">±0</span>;
  const up = v > 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? `▲ +${v}` : `▼ ${Math.abs(v)}`}
    </span>
  );
}

function Selector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-background px-2 py-1 text-sm"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
