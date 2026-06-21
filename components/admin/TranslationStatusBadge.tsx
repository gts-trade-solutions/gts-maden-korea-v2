"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Languages, Loader2 } from "lucide-react";

// Compact status pill shown on admin entity edit pages. Hits the
// translations API for the current entity and displays "X / 8 locales
// translated" plus a link to the dedicated editor.
//
// Designed to be cheap: one GET on mount, no polling. The editor
// itself is where admins do the actual work. This badge just gives
// them the "where am I at" signal without leaving the product form.

type Props = {
  kind: "products" | "brands" | "categories" | "banners";
  id: string;
  /** Auto-fetched coverage data overrides the loading state — useful
      when the parent already knows the value from a recent save. */
  initial?: { translated: number; total: number; humanEdited: number };
};

export function TranslationStatusBadge({ kind, id, initial }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; translated: number; total: number; humanEdited: number }
    | { kind: "error"; message: string }
  >(initial ? { kind: "ready", ...initial } : { kind: "loading" });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/content-translations/${kind}/${id}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json?.ok) {
          setState({ kind: "error", message: json?.error || res.statusText });
          return;
        }
        const total = json.locales.length;
        const translations: any[] = json.translations ?? [];
        // Non-source locales only (en-IN is the source).
        const nonSource = translations.filter((r) => r.locale !== "en-IN");
        const translated = nonSource.length;
        const humanEdited = nonSource.filter((r) => r.source === "human").length;
        setState({ kind: "ready", translated, total, humanEdited });
      } catch (err: any) {
        if (!cancelled) setState({ kind: "error", message: err?.message ?? "load failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  if (state.kind === "loading") {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Translations loading…
      </span>
    );
  }

  if (state.kind === "error") {
    return (
      <Link
        href={`/admin/translations/${kind}/${id}`}
        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
      >
        <Languages className="h-3.5 w-3.5" />
        Translations: error
      </Link>
    );
  }

  const { translated, total, humanEdited } = state;
  const complete = translated === total;
  return (
    <Link
      href={`/admin/translations/${kind}/${id}`}
      className={`
        inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors
        ${complete
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : translated === 0
          ? "border-muted bg-muted/40 text-muted-foreground hover:bg-muted/60"
          : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
        }
      `}
      title="Click to view or edit translations"
    >
      <Languages className="h-3.5 w-3.5" />
      <span className="tabular-nums">
        {translated} / {total} locales translated
      </span>
      {humanEdited > 0 && (
        <span className="text-[10px] rounded-full bg-blue-500/10 text-blue-700 px-1.5 py-0.5">
          {humanEdited} human
        </span>
      )}
    </Link>
  );
}
