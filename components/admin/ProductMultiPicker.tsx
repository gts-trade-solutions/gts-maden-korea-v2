"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Compact product reference returned by the picker. Stored on the host
// component as the source of truth for what's attached to the video.
export type PickerProduct = {
  id: string;
  slug: string;
  name: string;
  hero_image_path: string | null;
};

type Props = {
  value: PickerProduct[];
  onChange: (next: PickerProduct[]) => void;
  // Override search filter (e.g. limit to a brand / category later).
  // Defaults to is_published=true.
  publishedOnly?: boolean;
};

export function ProductMultiPicker({
  value,
  onChange,
  publishedOnly = true,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the results dropdown on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced search by name OR slug.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      let req = supabase
        .from("products")
        .select("id, slug, name, hero_image_path, is_published")
        .or(`name.ilike.%${q}%,slug.ilike.%${q}%`)
        .order("name", { ascending: true })
        .limit(15);
      if (publishedOnly) req = req.eq("is_published", true);
      const { data, error } = await req;
      if (cancelled) return;
      if (error) {
        console.error("ProductMultiPicker search error:", error);
        setResults([]);
      } else {
        setResults(((data ?? []) as PickerProduct[]).filter((p) => p.id));
      }
      setSearching(false);
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, publishedOnly]);

  const selectedIds = useMemo(() => new Set(value.map((p) => p.id)), [value]);

  const add = (p: PickerProduct) => {
    if (selectedIds.has(p.id)) return;
    onChange([...value, p]);
    setQuery("");
    setOpen(false);
  };

  const remove = (id: string) => onChange(value.filter((p) => p.id !== id));

  const move = (id: string, dir: "up" | "down") => {
    const idx = value.findIndex((p) => p.id === id);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= value.length) return;
    const copy = value.slice();
    [copy[idx], copy[swap]] = [copy[swap], copy[idx]];
    onChange(copy);
  };

  const filteredResults = results.filter((r) => !selectedIds.has(r.id));

  return (
    <div className="space-y-2">
      <div ref={wrapRef} className="relative">
        <input
          className="w-full border rounded px-2 py-1 text-sm"
          placeholder="Search product by name or slug…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
        />

        {open && query.trim().length >= 2 && (
          <div className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded border bg-white shadow-lg z-50">
            {searching ? (
              <div className="p-3 text-xs text-gray-500">Searching…</div>
            ) : filteredResults.length === 0 ? (
              <div className="p-3 text-xs text-gray-500">No matches.</div>
            ) : (
              <ul className="divide-y">
                {filteredResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => add(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium truncate min-w-0 flex-1">{p.name}</span>
                      <span className="text-xs text-gray-500 truncate shrink-0 max-w-[40%]">
                        {p.slug}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <ul className="divide-y rounded border">
          {value.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {/* `min-w-0` lets the inner truncate actually clip; without it,
                  long names blow the row open and shove the action buttons
                  off-screen. */}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-medium truncate">{p.name}</span>
                <span className="text-xs text-gray-500 truncate">{p.slug}</span>
              </div>
              <div className="shrink-0 inline-flex gap-1">
                <button
                  type="button"
                  onClick={() => move(p.id, "up")}
                  disabled={i === 0}
                  className="px-2 py-1 rounded border text-xs hover:bg-gray-50 disabled:opacity-30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(p.id, "down")}
                  disabled={i === value.length - 1}
                  className="px-2 py-1 rounded border text-xs hover:bg-gray-50 disabled:opacity-30"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="px-2 py-1 rounded border text-xs hover:bg-red-50 text-red-600"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {value.length === 0 && (
        <p className="text-xs text-gray-500">No products attached yet.</p>
      )}
    </div>
  );
}
