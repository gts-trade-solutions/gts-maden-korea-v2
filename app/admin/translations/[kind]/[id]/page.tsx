// /admin/translations/[kind]/[id]
//
// Per-entity translation editor. Layout:
//
//   ┌──────────────────────────────────────────────────────────┐
//   │ AdminBackBar · entity name + slug · per-row translate    │
//   ├──────────────────────────────────────────────────────────┤
//   │ Locale tabs:  pl  vi  fr  de  es  it  pt  en             │
//   ├──────────────────────────────────────────────────────────┤
//   │ For the selected locale:                                 │
//   │   • Status pill (AI / Human / Missing)                   │
//   │   • Per-field editor — English source on left, target    │
//   │     locale on right, side-by-side for every translatable │
//   │     field. Textareas for markdown/string fields. JSON     │
//   │     editor for faq / key_benefits / additional_details.  │
//   │   • Save (PATCH → flips row to source='human')           │
//   │   • Translate (POST → triggers AI for this entity+locale)│
//   │   • Delete (DELETE → reverts to English fallback)        │
//   └──────────────────────────────────────────────────────────┘

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type TranslationRow = {
  id: string;
  locale: string;
  source: string;
  source_hash: string | null;
  /** Server-computed: true when the row's source_hash doesn't match
   *  the current English source. UI surfaces this as a "Stale" badge
   *  + warning banner + emphasised Retranslate button. */
  stale: boolean;
  created_at: string;
  updated_at: string;
  [k: string]: any;
};

type EditorData = {
  ok: true;
  kind: string;
  locales: string[];
  translatableFields: string[];
  source: Record<string, any>;
  /** Hash of the current English source, computed by the API using the
   *  same fn the translator script uses. Useful for debugging only —
   *  the UI relies on the per-row `stale` flag, not this directly. */
  currentSourceHash: string;
  translations: TranslationRow[];
};

const VALID_KINDS = ["products", "brands", "categories", "banners"] as const;
type Kind = (typeof VALID_KINDS)[number];

export default function AdminTranslationEditorPage() {
  const params = useParams();
  const router = useRouter();
  const kind = params?.kind as Kind | undefined;
  const id = params?.id as string | undefined;

  const [data, setData] = useState<EditorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<string | null>(null);

  useEffect(() => {
    if (kind && !VALID_KINDS.includes(kind)) router.replace("/admin/translations");
  }, [kind, router]);

  async function load() {
    if (!kind || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/content-translations/${kind}/${id}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || res.statusText);
      setData(json);
      // Default to the first non-source locale that has a translation,
      // otherwise the first locale. This gives the admin a useful
      // landing view immediately.
      if (!selectedLocale) {
        const withTranslation = (json.translations as TranslationRow[]).find(
          (r) => r.locale !== "en-IN"
        );
        setSelectedLocale(withTranslation?.locale ?? json.locales[0]);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  const translationByLocale = useMemo(() => {
    const m: Record<string, TranslationRow> = {};
    for (const r of data?.translations ?? []) m[r.locale] = r;
    return m;
  }, [data]);

  return (
    <>
      <AdminBackBar
        to={kind ? `/admin/translations/${kind}` : "/admin/translations"}
        title={
          data?.source?.name ??
          data?.source?.alt ??
          (loading ? "Loading…" : "Translation editor")
        }
        rightSlot={
          <Button onClick={() => void load()} disabled={loading} size="sm" variant="outline">
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="container mx-auto py-6 space-y-6">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {data && (
          <>
            <LocaleTabs
              locales={data.locales}
              selected={selectedLocale}
              byLocale={translationByLocale}
              onSelect={setSelectedLocale}
            />

            {selectedLocale && (
              <LocaleEditor
                key={selectedLocale}
                kind={data.kind as Kind}
                entityId={id!}
                locale={selectedLocale}
                translatableFields={data.translatableFields}
                source={data.source}
                row={translationByLocale[selectedLocale] ?? null}
                onChanged={load}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

// ─── Locale tab strip ───────────────────────────────────────────────

function LocaleTabs({
  locales,
  selected,
  byLocale,
  onSelect,
}: {
  locales: string[];
  selected: string | null;
  byLocale: Record<string, TranslationRow>;
  onSelect: (locale: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b pb-3">
      {locales.map((l) => {
        const r = byLocale[l];
        const active = l === selected;
        const isHuman = r?.source === "human";
        const isMissing = !r;
        const isStale = !!r && r.stale === true;
        return (
          <button
            key={l}
            type="button"
            onClick={() => onSelect(l)}
            className={`
              inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors
              ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : isStale
                    ? "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900"
                    : "border-muted hover:bg-muted/50"
              }
            `}
          >
            <span className="font-mono">{l}</span>
            <span
              className={`inline-flex h-1.5 w-1.5 rounded-full ${
                isMissing ? "bg-muted-foreground/40" : isHuman ? "bg-blue-500" : "bg-emerald-500"
              }`}
              aria-label={
                isMissing ? "Not translated" : isHuman ? "Human-edited" : "AI-translated"
              }
            />
            {isStale && (
              <span
                className="inline-flex items-center rounded-full bg-amber-200 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
                title="Source changed since this translation was created"
              >
                Stale
              </span>
            )}
          </button>
        );
      })}
      <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> AI
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Human
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Missing
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="rounded-sm bg-amber-200 px-1 py-0 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            Stale
          </span>{" "}
          Source changed
        </span>
      </div>
    </div>
  );
}

// ─── Per-locale side-by-side editor ─────────────────────────────────

function LocaleEditor({
  kind,
  entityId,
  locale,
  translatableFields,
  source,
  row,
  onChanged,
}: {
  kind: Kind;
  entityId: string;
  locale: string;
  translatableFields: string[];
  source: Record<string, any>;
  row: TranslationRow | null;
  onChanged: () => Promise<void> | void;
}) {
  // Each field has its own local draft state so the admin can edit
  // multiple fields, then hit Save once. Initialised from `row`.
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    initialDraft(row, translatableFields)
  );
  // For jsonb fields (faq / key_benefits / additional_details) we
  // store the raw JSON string and parse on save. Lets admins edit
  // structured content as JSON without us forcing a row/cell editor.
  // Validation happens on save.
  const [saving, setSaving] = useState(false);
  const [translating, startTranslating] = useTransition();
  const [deleting, setDeleting] = useState(false);

  // Reset draft if `row` changes underneath us (e.g. after Translate).
  useEffect(() => {
    setDraft(initialDraft(row, translatableFields));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, row?.updated_at]);

  function setField(name: string, value: string) {
    setDraft((d) => ({ ...d, [name]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const fields: Record<string, any> = {};
      for (const f of translatableFields) {
        const raw = draft[f] ?? "";
        if (isJsonField(f)) {
          if (raw.trim() === "") {
            fields[f] = null;
          } else {
            try {
              fields[f] = JSON.parse(raw);
            } catch {
              toast.error(`${f}: invalid JSON`);
              setSaving(false);
              return;
            }
          }
        } else {
          fields[f] = raw === "" ? null : raw;
        }
      }
      const res = await fetch(`/api/admin/content-translations/${kind}/${entityId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, fields }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || res.statusText);
      toast.success("Saved. Marked as human-edited.");
      await onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function translate(force: boolean) {
    startTranslating(async () => {
      try {
        const res = await fetch("/api/admin/content-translations/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, id: entityId, locales: [locale], force }),
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || res.statusText);
        const r = json.result;
        if (r.errors?.length) {
          toast.error(`Translation error: ${r.errors[0].message}`);
        } else if (r.humanLocked > 0) {
          toast.info(
            "This locale is human-edited and locked. Use Force re-translate to overwrite."
          );
        } else if (r.translated > 0) {
          toast.success("Translated.");
        } else if (r.skipped > 0) {
          toast.info("Up to date.");
        }
        await onChanged();
      } catch (err: any) {
        toast.error(err?.message ?? "Translation failed");
      }
    });
  }

  async function remove() {
    if (!confirm(`Delete the ${locale} translation? The customer will see English instead.`))
      return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/content-translations/${kind}/${entityId}?locale=${encodeURIComponent(
          locale
        )}`,
        { method: "DELETE" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any)?.error || res.statusText);
      toast.success("Deleted.");
      await onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const isHuman = row?.source === "human";
  const isMissing = !row;
  const isStale = !!row && row.stale === true;

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        {isStale && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">
              The English source has changed since this translation was created.
            </p>
            <p className="mt-1 text-amber-800">
              {isHuman
                ? "Your manual edits are still preserved on the storefront, but the underlying English copy has drifted. Force re-translate to refresh from the new source (this WILL overwrite your manual edits), or update the fields here and save to re-anchor."
                : "Re-translate to refresh this locale from the current English source."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              isMissing
                ? "border-muted bg-muted/40 text-muted-foreground"
                : isHuman
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {isMissing ? "Missing" : isHuman ? "Human-edited" : "AI-translated"}
          </span>
          {isStale && (
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              Stale — source changed
            </span>
          )}
          {row && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Updated {new Date(row.updated_at).toLocaleString()}
            </span>
          )}

          <div className="ml-auto flex flex-wrap gap-2">
            {isMissing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => translate(false)}
                disabled={translating}
              >
                {translating ? "Translating…" : "Translate"}
              </Button>
            ) : (
              <>
                <Button
                  // When stale, promote retranslate to a primary CTA so
                  // it stands out as the recommended action.
                  variant={isStale ? "default" : "outline"}
                  size="sm"
                  onClick={() => translate(true)}
                  disabled={translating}
                  title={
                    isHuman
                      ? "Force overwrites your manual edits. Are you sure?"
                      : "Re-translate from the English source."
                  }
                >
                  {translating ? "Translating…" : isHuman ? "Force re-translate" : "Re-translate"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={remove}
                  disabled={deleting}
                  className="text-destructive hover:text-destructive"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </>
            )}
            <Button
              onClick={save}
              disabled={saving}
              size="sm"
              // When stale, the manual save path is secondary — the
              // visual gradient nudges admins toward Re-translate.
              variant={isStale ? "outline" : "default"}
            >
              {saving ? "Saving…" : "Save (mark human)"}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {translatableFields.map((f) => (
            <FieldRow
              key={f}
              fieldName={f}
              sourceValue={source[f]}
              draftValue={draft[f] ?? ""}
              onChange={(v) => setField(f, v)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Single field row ───────────────────────────────────────────────

function FieldRow({
  fieldName,
  sourceValue,
  draftValue,
  onChange,
}: {
  fieldName: string;
  sourceValue: any;
  draftValue: string;
  onChange: (v: string) => void;
}) {
  const isJson = isJsonField(fieldName);
  const renderedSource = renderSourceForDisplay(sourceValue, isJson);
  const looksEmpty = sourceValue == null || sourceValue === "";

  return (
    <div>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
        {fieldName}
        {isJson && <span className="ml-2 text-[10px] normal-case text-muted-foreground/80">(JSON)</span>}
        {looksEmpty && (
          <span className="ml-2 text-[10px] normal-case text-muted-foreground/80">
            — source empty
          </span>
        )}
      </Label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">English source</div>
          <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words font-sans max-h-72 overflow-y-auto">
            {renderedSource || "(empty)"}
          </pre>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">Translation</div>
          <Textarea
            value={draftValue}
            onChange={(e) => onChange(e.target.value)}
            className={`min-h-[8rem] font-${isJson ? "mono text-xs" : "sans text-sm"}`}
            placeholder={isJson ? "{\n  …\n}" : ""}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

const JSONB_FIELDS = new Set(["faq", "key_benefits", "additional_details"]);
function isJsonField(name: string) {
  return JSONB_FIELDS.has(name);
}

function renderSourceForDisplay(value: any, isJson: boolean): string {
  if (value == null) return "";
  if (isJson) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function initialDraft(
  row: TranslationRow | null,
  translatableFields: string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of translatableFields) {
    const v = row?.[f];
    if (v == null) {
      out[f] = "";
    } else if (isJsonField(f)) {
      try {
        out[f] = JSON.stringify(v, null, 2);
      } catch {
        out[f] = String(v);
      }
    } else {
      out[f] = String(v);
    }
  }
  return out;
}
