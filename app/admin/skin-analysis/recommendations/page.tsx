"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { X, RefreshCw, Loader2 } from "lucide-react";

type Prod = { productId: string; name: string; slug: string | null };
type Concern = {
  concernType: string;
  label: string;
  description: string | null;
  threshold: number; // 0-1
  enabled: boolean;
  products: Prod[];
};

export default function SkinRecommendationsPage() {
  const [concerns, setConcerns] = useState<Concern[] | null>(null);
  const [denied, setDenied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/skin/recommendations", {
        cache: "no-store",
      });
      if (r.status === 401 || r.status === 403) {
        setDenied("You don't have access to this page.");
        setConcerns([]);
        return;
      }
      const d = await r.json();
      setConcerns(d.concerns ?? []);
    } catch {
      toast.error("Failed to load.");
      setConcerns([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function patchLocal(concernType: string, patch: Partial<Concern>) {
    setConcerns((prev) =>
      prev
        ? prev.map((c) =>
            c.concernType === concernType ? { ...c, ...patch } : c,
          )
        : prev,
    );
  }

  async function saveSetting(
    concernType: string,
    data: { threshold?: number; enabled?: boolean },
  ) {
    try {
      const r = await fetch("/api/admin/skin/recommendations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ concernType, ...data }),
      });
      if (!r.ok) toast.error("Could not save.");
    } catch {
      toast.error("Could not save.");
    }
  }

  async function addProduct(concernType: string, p: Prod) {
    // optimistic
    const target = concerns?.find((c) => c.concernType === concernType);
    if (target?.products.some((x) => x.productId === p.productId)) return;
    patchLocal(concernType, {
      products: [...(target?.products ?? []), p],
    });
    try {
      const r = await fetch("/api/admin/skin/recommendations/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ concernType, productId: p.productId }),
      });
      if (!r.ok) throw new Error();
    } catch {
      toast.error("Could not add product.");
      load();
    }
  }

  async function removeProduct(concernType: string, productId: string) {
    const target = concerns?.find((c) => c.concernType === concernType);
    patchLocal(concernType, {
      products: (target?.products ?? []).filter(
        (x) => x.productId !== productId,
      ),
    });
    try {
      await fetch("/api/admin/skin/recommendations/products", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ concernType, productId }),
      });
    } catch {
      toast.error("Could not remove product.");
      load();
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Skin analysis — recommendations
          </h1>
          <p className="text-sm text-muted-foreground">
            Attach products to each concern. They&apos;re shown to a user when
            their score for that concern falls below the threshold.
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {denied ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {denied}
        </p>
      ) : concerns == null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {concerns.map((c) => (
            <ConcernCard
              key={c.concernType}
              concern={c}
              onSetting={(data) => {
                patchLocal(c.concernType, data as Partial<Concern>);
                saveSetting(c.concernType, data);
              }}
              onAdd={(p) => addProduct(c.concernType, p)}
              onRemove={(pid) => removeProduct(c.concernType, pid)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConcernCard({
  concern,
  onSetting,
  onAdd,
  onRemove,
}: {
  concern: Concern;
  onSetting: (d: { threshold?: number; enabled?: boolean }) => void;
  onAdd: (p: Prod) => void;
  onRemove: (productId: string) => void;
}) {
  const [pctInput, setPctInput] = useState(String(Math.round(concern.threshold * 100)));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{concern.label}</CardTitle>
            {concern.description ? (
              <CardDescription>{concern.description}</CardDescription>
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={concern.enabled}
              onChange={(e) => onSetting({ enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Recommend when score below</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={pctInput}
            onChange={(e) => setPctInput(e.target.value)}
            onBlur={() => {
              let n = Number(pctInput);
              if (!Number.isFinite(n)) n = Math.round(concern.threshold * 100);
              n = Math.max(0, Math.min(100, n));
              setPctInput(String(n));
              onSetting({ threshold: n / 100 });
            }}
            className="h-8 w-20"
          />
          <span className="text-muted-foreground">/ 100</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {concern.products.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No products attached.
            </span>
          ) : (
            concern.products.map((p) => (
              <span
                key={p.productId}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
              >
                {p.name}
                <button
                  onClick={() => onRemove(p.productId)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${p.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))
          )}
        </div>

        <ProductSearchAdd onAdd={onAdd} />
      </CardContent>
    </Card>
  );
}

function ProductSearchAdd({ onAdd }: { onAdd: (p: Prod) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; slug: string }[]
  >([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/admin/catalog/product-search?q=${encodeURIComponent(q)}&publishedOnly=1`,
        );
        const d = await r.json();
        if (active) {
          setResults(d.products ?? []);
          setOpen(true);
        }
      } catch {
        /* ignore */
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search products to add…"
        className="h-8"
      />
      {open && results.length > 0 ? (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-background shadow-lg">
          {results.map((p) => (
            <button
              key={p.id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onAdd({ productId: p.id, name: p.name, slug: p.slug });
                setQ("");
                setResults([]);
                setOpen(false);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
