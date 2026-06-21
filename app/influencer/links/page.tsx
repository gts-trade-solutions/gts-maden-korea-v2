'use client';

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type Product = { id: string; name: string; slug: string };

export default function LinksPage() {
  const t = useTranslations("influencer");
  const [origin, setOrigin] = useState("");
  const [handle, setHandle] = useState<string>("");
  const [share, setShare] = useState<string>("");
  const [msg, setMsg] = useState<string|null>(null);

  // dropdown
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Product[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      // fetch my handle (same as before)
      const me = await fetch("/api/me/influencer");
      const mj = await me.json().catch(()=>({}));
      if (me.ok && mj?.handle) setHandle(mj.handle);

      // initial product options
      await searchProducts("");
    })();
  }, []);

  async function searchProducts(q: string) {
    const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=20`);
    const j = await res.json().catch(()=>({}));
    if (res.ok) setOptions(j.products || []);
  }

  function onSearchChange(v: string) {
    setSearch(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => searchProducts(v), 200);
  }

  function buildLink(prod: Product | null, h: string) {
    if (!prod || !h) return "";
    // Product-based share link using handle + slug
    return `${origin}/r/${h}?p=${encodeURIComponent(prod.slug)}`;
  }

  useEffect(() => {
    setShare(buildLink(selected, handle));
  }, [selected, handle, origin]);

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-semibold">{t("linksPageTitle")}</h2>
      {!handle ? (
        <p className="text-sm text-destructive">{t("linksHandleMissing")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="md:col-span-2 relative">
              <input
                className="w-full border rounded px-3 py-2"
                placeholder={selected ? selected.name : t("searchPlaceholder")}
                value={search}
                onFocus={() => setShowDrop(true)}
                onChange={(e)=>onSearchChange(e.target.value)}
              />
              {showDrop && (
                <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded border bg-white shadow">
                  {options.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">{t("noResults")}</div>
                  ) : options.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/50"
                      onClick={() => { setSelected(p); setSearch(p.name); setShowDrop(false); }}
                    >
                      <div className="text-sm">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.slug}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="rounded bg-black text-white px-3 py-2"
              onClick={() => {
                if (!selected) { setMsg(t("linksSelectFirst")); return; }
                const url = buildLink(selected, handle);
                setShare(url);
                navigator.clipboard.writeText(url);
                setMsg(t("linksCopiedToClipboard"));
              }}
            >
              {t("generateAndCopyBtn")}
            </button>
          </div>

          <div className="rounded border bg-background p-3">
            <div className="text-sm text-muted-foreground mb-1">{t("yourLinkLabel")}</div>
            <div className="text-sm break-all">{share || t("emDash")}</div>
          </div>
          {msg && <p className="text-sm">{msg}</p>}
        </>
      )}
    </div>
  );
}
