"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  Minus,
  HeartPulse,
  Droplet,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { concernLabel, concernOrder } from "@/lib/integrations/skinConcerns";

type C = { key: string; score: number };

// Band by 0-1 health score. Cutoffs mirror scoreRating (50 / 75) but expose
// hex + soft colors for the SVG chart, gauge and chips.
type Band = {
  key: "needs" | "fair" | "good";
  label: string;
  hex: string;
  bg: string;
  text: string;
  bar: string;
};
function band(score01: number): Band {
  const p = score01 * 100;
  if (p >= 75)
    return { key: "good", label: "Good", hex: "#16a34a", bg: "bg-emerald-100", text: "text-emerald-600", bar: "bg-emerald-500" };
  if (p >= 50)
    return { key: "fair", label: "Fair", hex: "#f59e0b", bg: "bg-amber-100", text: "text-amber-600", bar: "bg-amber-500" };
  return { key: "needs", label: "Needs care", hex: "#dc2626", bg: "bg-red-100", text: "text-red-600", bar: "bg-red-500" };
}

/**
 * Rich, infographic-style skin profile: overall gauge + iconified radar with
 * per-concern colored scores + key insights + top strengths + band cards.
 * Pure presentation over the analysis data; responsive (stacks on mobile and in
 * print) and print-friendly.
 */
export function SkinProfileDashboard({
  overall,
  concerns,
}: {
  overall: number | null;
  concerns: C[];
}) {
  // Recharts measures the DOM → browser only. Gate on mount to keep SSR and the
  // first client render identical (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fixed axis order so the shape is comparable across reports.
  const ordered = [...concerns].sort(
    (a, b) => concernOrder(a.key) - concernOrder(b.key),
  );
  const chartData = ordered.map((c) => ({
    key: c.key,
    label: concernLabel(c.key),
    score: Math.round(c.score * 100),
  }));
  const byLabel = new Map(chartData.map((d) => [d.label, d]));

  const overallPct = overall != null ? Math.round(overall * 100) : null;
  const overallBand = overall != null ? band(overall) : null;
  const stroke = overallBand?.hex ?? "#f59e0b";

  const needs = ordered.filter((c) => c.score * 100 < 50);
  const moderate = ordered.filter((c) => c.score * 100 >= 50 && c.score * 100 < 75);
  const good = ordered.filter((c) => c.score * 100 >= 75);
  const topStrengths = [...concerns].sort((a, b) => b.score - a.score).slice(0, 3);

  // Radar tick: concern name + its score, the score tinted by its band.
  const renderTick = (props: any) => {
    const { x, y, textAnchor, payload } = props;
    const d = byLabel.get(payload?.value);
    if (!d) return null;
    const b = band(d.score / 100);
    return (
      <g>
        <text
          x={x}
          y={y}
          textAnchor={textAnchor}
          dominantBaseline="central"
          fontSize={11}
          fontWeight={600}
          fill="#334155"
        >
          {d.label}
        </text>
        <text
          x={x}
          y={y + 13}
          textAnchor={textAnchor}
          dominantBaseline="central"
          fontSize={12}
          fontWeight={700}
          fill={b.hex}
        >
          {d.score}
        </text>
      </g>
    );
  };

  return (
    <div>
      {/* Header + score scale */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold uppercase tracking-wide text-slate-800">
            Skin Profile Analysis
          </h2>
          <p className="text-xs text-muted-foreground">
            Your personalised skin health overview
          </p>
        </div>
        <div className="rounded-lg border bg-white px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Score scale (0–100)
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600">
            <ScaleDot hex="#dc2626" label="0–50 Needs care" />
            <ScaleDot hex="#f59e0b" label="50–75 Fair" />
            <ScaleDot hex="#16a34a" label="75–100 Good" />
          </div>
        </div>
      </div>

      {/* Radar — full-width hero so it gets the whole document width instead of
          being squeezed between side panels. */}
      <div className="break-inside-avoid rounded-xl border bg-white p-2 sm:p-4">
        <div className="h-[380px] w-full sm:h-[520px]">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={chartData}
                outerRadius="74%"
                margin={{ top: 28, right: 48, bottom: 28, left: 48 }}
              >
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="label" tick={renderTick as any} />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  angle={90}
                  tickCount={5}
                  tick={{ fontSize: 9, fill: "#9ca3af" }}
                  axisLine={false}
                />
                <Radar
                  dataKey="score"
                  stroke={stroke}
                  fill={stroke}
                  fillOpacity={0.25}
                  dot={{ r: 3.5, fill: stroke, strokeWidth: 0 }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>

      {/* gauge · key insights · top strengths */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* Overall gauge */}
        <div className="break-inside-avoid rounded-xl border bg-white p-4 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Overall skin health score
          </div>
          <div className="mx-auto mt-3 h-32 w-32">
            <Donut pct={overallPct} band={overallBand} />
          </div>
          <p className="mt-3 text-xs leading-snug text-muted-foreground">
            {overallBand?.key === "good"
              ? "Great condition — keep up your routine."
              : overallBand?.key === "fair"
                ? "Focus on consistent care to improve your skin health."
                : "A focused routine will lift your skin health."}
          </p>
        </div>

        {/* Key insights */}
        <div className="break-inside-avoid space-y-3 rounded-xl border bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Key insights
          </div>
          <InsightGroup
            icon={ArrowDown}
            tone={{ bg: "bg-red-100", text: "text-red-600" }}
            title="Needs attention"
            hint="scores below 50"
            names={needs.map((c) => concernLabel(c.key))}
          />
          <InsightGroup
            icon={Minus}
            tone={{ bg: "bg-amber-100", text: "text-amber-600" }}
            title="Moderate areas"
            hint="scores 50–75"
            names={moderate.map((c) => concernLabel(c.key))}
          />
          <InsightGroup
            icon={ArrowUp}
            tone={{ bg: "bg-emerald-100", text: "text-emerald-600" }}
            title="Doing well"
            hint="scores above 75"
            names={good.map((c) => concernLabel(c.key))}
          />
        </div>

        {/* Top strengths */}
        {topStrengths.length ? (
          <div className="break-inside-avoid rounded-xl border bg-white p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
              Top strengths
            </div>
            <div className="space-y-2">
              {topStrengths.map((c) => {
                const b = band(c.score);
                return (
                  <div
                    key={c.key}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <span className="truncate text-xs font-medium text-slate-700">
                      {concernLabel(c.key)}
                    </span>
                    <span className={`shrink-0 text-sm font-bold ${b.text}`}>
                      {Math.round(c.score * 100)}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        /100
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Band recommendation cards */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BandCard
          icon={HeartPulse}
          tone={{ bg: "bg-red-100", text: "text-red-600", bar: "bg-red-500" }}
          title="Needs care"
          count={needs.length}
          body="Focus on treating these concerns with targeted skincare."
        />
        <BandCard
          icon={Droplet}
          tone={{ bg: "bg-amber-100", text: "text-amber-600", bar: "bg-amber-500" }}
          title="Fair"
          count={moderate.length}
          body="Maintain a consistent routine to keep improving."
        />
        <BandCard
          icon={ShieldCheck}
          tone={{ bg: "bg-emerald-100", text: "text-emerald-600", bar: "bg-emerald-500" }}
          title="Good"
          count={good.length}
          body="Keep it up — these areas are in great shape."
        />
        <BandCard
          icon={Sparkles}
          tone={{ bg: "bg-blue-100", text: "text-blue-600", bar: "bg-blue-500" }}
          title="Daily essentials"
          count={null}
          body="Cleanse, hydrate, protect and nourish every day."
        />
      </div>
    </div>
  );
}

function ScaleDot({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: hex }}
      />
      {label}
    </span>
  );
}

function Donut({ pct, band: b }: { pct: number | null; band: Band | null }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const val = pct ?? 0;
  const dash = (val / 100) * c;
  const hex = b?.hex ?? "#f59e0b";
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={hex}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform="rotate(-90 60 60)"
      />
      <text
        x="60"
        y="56"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="30"
        fontWeight="700"
        fill={hex}
      >
        {pct ?? "—"}
      </text>
      <text
        x="60"
        y="82"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="11"
        fontWeight="600"
        fill="#64748b"
      >
        {(b?.label ?? "").toUpperCase()}
      </text>
    </svg>
  );
}

function InsightGroup({
  icon: Icon,
  tone,
  title,
  hint,
  names,
}: {
  icon: LucideIcon;
  tone: { bg: string; text: string };
  title: string;
  hint: string;
  names: string[];
}) {
  if (!names.length) return null;
  return (
    <div className="flex gap-2.5">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone.bg}`}
      >
        <Icon className={`h-3.5 w-3.5 ${tone.text}`} />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-800">{title}</div>
        <div className="text-[11px] leading-snug text-muted-foreground">
          {names.join(", ")}
        </div>
        <div className="text-[10px] text-slate-400">({hint})</div>
      </div>
    </div>
  );
}

function BandCard({
  icon: Icon,
  tone,
  title,
  count,
  body,
}: {
  icon: LucideIcon;
  tone: { bg: string; text: string; bar: string };
  title: string;
  count: number | null;
  body: string;
}) {
  return (
    <div className="flex break-inside-avoid flex-col overflow-hidden rounded-xl border bg-white">
      <div className="flex-1 p-3">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone.bg}`}
          >
            <Icon className={`h-4 w-4 ${tone.text}`} />
          </span>
          <div className={`text-sm font-semibold ${tone.text}`}>{title}</div>
        </div>
        {count != null ? (
          <div className="mt-1.5 text-[11px] font-medium text-slate-500">
            {count} area{count === 1 ? "" : "s"}
          </div>
        ) : null}
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {body}
        </p>
      </div>
      <div className={`h-1 ${tone.bar}`} />
    </div>
  );
}
