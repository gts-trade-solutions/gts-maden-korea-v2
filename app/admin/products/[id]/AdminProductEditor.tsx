"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadMedia, deleteMedia } from "@/lib/storage/upload-client";
import { resolveMediaUrl } from "@/lib/storage/backend";
import { adminWrite } from "@/lib/admin/catalog-write";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Upload, Globe2 } from "lucide-react";
import ProductStoryEditor from "@/components/admin/ProductStoryEditor";
import { TranslationStatusBadge } from "@/components/admin/TranslationStatusBadge";
import {
  SUPPORTED_COUNTRIES,
  COUNTRY_PROFILES,
} from "@/lib/countries";
import { CountryFlag } from "@/components/CountryFlag";

/* ───────── helpers ───────── */
function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function skuify(s: string) {
  return s.toUpperCase().trim()
    .replace(/[^A-Z0-9]+/g, "-").replace(/-+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 40);
}
function safeKeyPart(s: string) {
  return s.trim().toLowerCase()
    .replace(/\s+/g, "-").replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}
function toDateInputValue(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * `<input type="datetime-local">` requires the value in EXACTLY
 * `YYYY-MM-DDTHH:mm` format — it silently renders empty for any other
 * shape (including the `YYYY-MM-DDTHH:mm:ss+TZ` strings Supabase
 * returns for timestamptz columns). We convert ISO → local components
 * here so saved sale dates actually re-display in the input on reload.
 */
function toDateTimeLocalInputValue(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Inverse: take the `YYYY-MM-DDTHH:mm` value the input emits (local
 * time, no timezone) and turn it back into an ISO timestamp the DB
 * column expects. Returns null for empty input so the column stays
 * NULL rather than the epoch.
 */
function fromDateTimeLocalInputValue(local?: string | null) {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type BrandRow = { id: string; name?: string|null; slug?: string|null };
type CategoryRow = { id: string; name?: string|null; slug?: string|null };
type VendorRow = { id: string; display_name?: string|null };

type ImageRow = {
  id?: string;               // product_images.id (existing)
  file?: File;               // new upload
  storage_path?: string;     // existing path
  alt: string;
  sort_order: number;
  remove?: boolean;
};

type Model = {
  id: string;
  vendor_id: string | null; // SHOWN read-only, NEVER saved
  sku: string;
  slug: string;
  name: string;
  brand_id: string | "";
  category_id: string | "";
  price: number | null;
  currency: string | null;
  short_description: string;
  description: string;

  is_published: boolean;
  compare_at_price: number | null;
  sale_price: number | null;
  sale_starts_at: string | "";
  sale_ends_at: string | "";

  /* badges */
  made_in_korea: boolean;
  is_vegetarian: boolean;
  cruelty_free: boolean;
  toxin_free: boolean;
  paraben_free: boolean;

  /* SEO / rich */
  meta_title: string;
  meta_description: string;
  ingredients_md: string;
  key_features_md: string;
  additional_details_md: string;
  box_contents_md: string;
  attributes_json: string;   // json text
  faq_text: string;          // "Q::A||Q2::A2"
  key_benefits_text: string; // "Hydrating|Soothing"

  volume_ml: number | null;
  net_weight_g: number | null;
  gross_weight_g: number | null;
  country_of_origin: string;

  /* admin-only */
  is_featured: boolean;
  featured_rank: number | "" | null;
  is_trending: boolean;
  is_bundle: boolean;
  new_until: string;         // yyyy-mm-dd

  /* media */
  images: ImageRow[];
  video_file?: File | null;
  video_path?: string | null;   // existing
  remove_video?: boolean;
};

export function AdminProductEditor({ productId }: { productId: string }) {
  const router = useRouter();

  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [model, setModel] = useState<Model | null>(null);

  const [busy, setBusy] = useState(false);
  const [overwriteStorage, setOverwriteStorage] = useState(false);
  const [deleteMediaFromStorage, setDeleteMediaFromStorage] = useState(false);

  // Country offers — per-country offer price. Lives on
  // `product_country_prices`; resolver in lib/pricing.ts walks: country
  // offer > legacy sale_price within window > legacy price. Empty input
  // for a country means "no offer" — that country falls through to the
  // legacy pricing on save. Active toggle lets admin keep a saved
  // value but pause it.
  type CountryOfferState = {
    country_code: string;
    offer_price: string; // string for input control; "" = no offer
    is_active: boolean;
  };
  const [countryOffers, setCountryOffers] = useState<CountryOfferState[]>(
    () =>
      SUPPORTED_COUNTRIES.map((cc) => ({
        country_code: cc,
        offer_price: "",
        is_active: true,
      }))
  );
  const [bulkOfferPrice, setBulkOfferPrice] = useState<string>("");
  const [loadingCountryOffers, setLoadingCountryOffers] = useState(true);

  /* load product + lookups */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // (optional) check admin role via RLS/rpc here if you have it
      // Load via the admin service-role endpoint (MySQL) so HIDDEN products load
      // too — the browser anon client is RLS-blocked for unpublished rows under
      // NextAuth, which surfaced as a false "Product not found".
      const res = await fetch(`/api/admin/catalog/products?id=${encodeURIComponent(productId)}`, { credentials: "include" });
      const payload = await res.json().catch(() => ({} as any));
      if (cancelled) return;
      if (!res.ok || !payload?.ok || !payload?.product) {
        if (res.status === 404 || payload?.error === "NOT_FOUND") { toast.error("Product not found"); router.replace("/admin/products"); return; }
        toast.error(payload?.error || "Failed to load product"); return;
      }
      const prod = payload.product as any;
      const imgs = (payload.images ?? []) as any[];
      setBrands((payload.brands ?? []) as BrandRow[]);
      setCategories((payload.categories ?? []) as CategoryRow[]);
      setVendor((payload.vendor ?? null) as any);

      const m: Model = {
        id: prod.id,
        vendor_id: prod.vendor_id ?? null,

        sku: prod.sku || "",
        slug: prod.slug || "",
        name: prod.name || "",
        brand_id: prod.brand_id || "",
        category_id: prod.category_id || "",
        price: prod.price ?? null,
        currency: prod.currency || "INR",
        short_description: prod.short_description || "",
        description: prod.description || "",

        is_published: !!prod.is_published,
        compare_at_price: prod.compare_at_price ?? null,
        sale_price: prod.sale_price ?? null,
        sale_starts_at: toDateTimeLocalInputValue(prod.sale_starts_at),
        sale_ends_at: toDateTimeLocalInputValue(prod.sale_ends_at),

        made_in_korea: !!prod.made_in_korea,
        is_vegetarian: !!prod.is_vegetarian,
        cruelty_free: !!prod.cruelty_free,
        toxin_free: !!prod.toxin_free,
        paraben_free: !!prod.paraben_free,

        meta_title: prod.meta_title || "",
        meta_description: prod.meta_description || "",
        ingredients_md: prod.ingredients_md || "",
        key_features_md: prod.key_features_md || "",
        additional_details_md: prod.additional_details_md || "",
        box_contents_md: prod.box_contents_md || "",
        attributes_json: JSON.stringify(prod.attributes ?? {}, null, 0),
        faq_text: ((prod.faq ?? []) as any[]).map((x: any) => `${x?.q ?? ""}::${x?.a ?? ""}`).filter(Boolean).join("||"),
        key_benefits_text: ((prod.key_benefits ?? []) as any[]).join("|"),

        volume_ml: prod.volume_ml ?? null,
        net_weight_g: prod.net_weight_g ?? null,
        gross_weight_g: prod.gross_weight_g ?? null,
        country_of_origin: prod.country_of_origin || "",

        is_featured: !!prod.is_featured,
        featured_rank: prod.featured_rank ?? "",
        is_trending: !!prod.is_trending,
        is_bundle: !!prod.is_bundle,
        new_until: toDateInputValue(prod.new_until),

        images: ((imgs ?? []) as any[]).map((r) => ({
          id: r.id, storage_path: r.storage_path, alt: r.alt ?? "", sort_order: r.sort_order ?? 0,
        })),
        video_file: null,
        video_path: prod.video_path ?? null,
        remove_video: false,
      };
      setModel(m);
    })();

    return () => { cancelled = true; };
  }, [productId, router]);

  // Load country offers in parallel to the main product load. Lives in
  // its own effect so we can keep the main effect focused — and so we
  // can refresh just the offers after a PUT without re-pulling the
  // whole product/images/lookups payload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCountryOffers(true);
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch(
          `/api/admin/products/${encodeURIComponent(productId)}/country-prices`,
          {
            credentials: "include",
            cache: "no-store",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }
        );
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && body.ok) {
          const existing = new Map<string, { offer_price: number; is_active: boolean }>();
          (body.offers ?? []).forEach((r: any) => {
            existing.set(String(r.country_code).toUpperCase(), {
              offer_price: Number(r.offer_price),
              is_active: r.is_active !== false,
            });
          });
          setCountryOffers(
            SUPPORTED_COUNTRIES.map((cc) => {
              const row = existing.get(cc);
              return row
                ? {
                    country_code: cc,
                    offer_price: String(row.offer_price),
                    is_active: row.is_active,
                  }
                : { country_code: cc, offer_price: "", is_active: true };
            })
          );
        }
      } finally {
        if (!cancelled) setLoadingCountryOffers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const addImageSlot = () => {
    setModel(m => {
      if (!m) return m;
      if (m.images.length >= 5) return m;
      const nextSort = (m.images[m.images.length - 1]?.sort_order ?? -1) + 1;
      return { ...m, images: [...m.images, { alt: "", sort_order: Math.max(0, nextSort) }] };
    });
  };
  const removeImageSlot = (idx: number) => {
    setModel(m => {
      if (!m) return m;
      const copy = [...m.images];
      const row = copy[idx];
      if (row?.id) copy[idx] = { ...row, remove: true };
      else copy.splice(idx, 1);
      return { ...m, images: copy };
    });
  };

  const canSave = useMemo(() => {
    if (!model) return false;
    return !!model.name && !!model.brand_id && !!model.category_id;
  }, [model]);

  const onSave = async (backAfter = false) => {
    if (!model) return;
    setBusy(true);
    try {
      /* identity normalization */
      let sku = model.sku?.trim();
      if (!sku) {
        const seed = model.slug?.trim() || model.name || "PRODUCT";
        sku = skuify(seed);
      } else {
        sku = skuify(sku);
      }
      let slug = model.slug?.trim();
      if (!slug) slug = slugify(sku || model.name || "product");
      else slug = slugify(slug);

      /* build payload (NOTE: vendor_id intentionally NOT included) */
      const payload: any = {
        sku, slug, name: model.name,
        brand_id: model.brand_id || null,
        category_id: model.category_id || null,

        short_description: model.short_description || null,
        description: model.description || null,
        price: model.price ?? null,
        currency: model.currency || "INR",
        compare_at_price: model.compare_at_price ?? null,
        sale_price: model.sale_price ?? null,
        sale_starts_at: fromDateTimeLocalInputValue(model.sale_starts_at),
        sale_ends_at: fromDateTimeLocalInputValue(model.sale_ends_at),
        is_published: !!model.is_published,

        made_in_korea: !!model.made_in_korea,
        is_vegetarian: !!model.is_vegetarian,
        cruelty_free: !!model.cruelty_free,
        toxin_free: !!model.toxin_free,
        paraben_free: !!model.paraben_free,

        meta_title: model.meta_title || null,
        meta_description: model.meta_description || null,
        ingredients_md: model.ingredients_md || null,
        key_features_md: model.key_features_md || null,
        additional_details_md: model.additional_details_md || null,
        box_contents_md: model.box_contents_md || null,
        attributes: (() => { try { return JSON.parse(model.attributes_json || "{}"); } catch { return {}; } })(),
        faq: (model.faq_text || "").split("||").map((pair) => {
          const [q, a] = pair.split("::").map((x) => (x ?? "").trim());
          if (!q && !a) return null;
          return { q, a };
        }).filter(Boolean),
        key_benefits: (model.key_benefits_text || "").split("|").map(s => s.trim()).filter(Boolean),

        volume_ml: model.volume_ml ?? null,
        net_weight_g: model.net_weight_g ?? null,
        gross_weight_g: model.gross_weight_g ?? null,
        country_of_origin: model.country_of_origin || null,

        /* admin-only */
        is_featured: !!model.is_featured,
        featured_rank: model.featured_rank === "" ? null : (model.featured_rank ?? null),
        is_trending: !!model.is_trending,
        is_bundle: !!model.is_bundle,
        new_until: model.new_until ? new Date(`${model.new_until}T00:00:00Z`).toISOString() : null,
      };

      /* update product (no vendor_id in set; no vendor filter in WHERE) */
      await adminWrite({ table: "products", op: "update", data: payload, match: { id: model.id } });

      /* media */
      const bucket = "product-media";
      const safeSku = safeKeyPart(sku);
      const imgRows: { product_id: string; storage_path: string; alt: string|null; sort_order: number }[] = [];
      const toDeleteIds: string[] = [];

      for (const row of model.images) {
        if (row.remove && row.id) {
          toDeleteIds.push(row.id);
          continue;
        }
        let storage_path = row.storage_path;
        if (row.file) {
          const clean = safeKeyPart(row.file.name);
          const key = `${safeSku}/${clean}`;
          try {
            const { path } = await uploadMedia(bucket, key, row.file, { upsert: overwriteStorage });
            storage_path = path;
          } catch (upE: any) {
            if (upE?.message?.includes("already exists") && !overwriteStorage) {
              throw new Error(`Image already exists: ${key}`);
            }
            throw upE;
          }
        }
        if (storage_path) {
          imgRows.push({ product_id: model.id, storage_path, alt: row.alt || null, sort_order: Number.isFinite(row.sort_order as any) ? (row.sort_order as number) : 0 });
        }
      }

      /* delete removed image rows */
      if (toDeleteIds.length) {
        // Read the storage paths first (so we can optionally purge the
        // files) — adminWrite deletes by equality match and doesn't
        // return the removed rows.
        const { data: removed } = await supabase
          .from("product_images")
          .select("storage_path")
          .in("id", toDeleteIds);
        for (const id of toDeleteIds) {
          await adminWrite({
            table: "product_images",
            op: "delete",
            match: { id },
            mirrorScope: model.id,
          });
        }
        if (deleteMediaFromStorage) {
          const paths = (removed ?? []).map((r: any) => r.storage_path);
          for (const p of paths) {
            if (p) await deleteMedia(bucket, p);
          }
        }
      }

      /* upsert images (unique index on product_id,storage_path recommended) */
      if (imgRows.length) {
        await adminWrite({
          table: "product_images",
          op: "upsert",
          data: imgRows,
          onConflict: "product_id,storage_path",
        });

        // derive hero/og from first two by sort_order (only if we changed images this run)
        const sorted = imgRows.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const hero = sorted[0]?.storage_path ?? null;
        const og   = sorted[1]?.storage_path ?? null;
        await adminWrite({
          table: "products",
          op: "update",
          data: { hero_image_path: hero, og_image_path: og },
          match: { id: model.id },
        });
      }

      /* video */
      if (model.remove_video) {
        await adminWrite({
          table: "products",
          op: "update",
          data: { video_path: null },
          match: { id: model.id },
        });
        if (deleteMediaFromStorage && model.video_path) {
          await deleteMedia(bucket, model.video_path);
        }
      } else if (model.video_file) {
        const clean = safeKeyPart(model.video_file.name);
        const key = `${safeSku}/video/${clean}`;
        let videoPath: string;
        try {
          const { path } = await uploadMedia(bucket, key, model.video_file, { upsert: overwriteStorage });
          videoPath = path;
        } catch (vErr: any) {
          if (vErr?.message?.includes("already exists") && !overwriteStorage) {
            throw new Error(`Video already exists: ${key}`);
          }
          throw vErr;
        }
        await adminWrite({
          table: "products",
          op: "update",
          data: { video_path: videoPath },
          match: { id: model.id },
        });
      }

      // (MySQL sync now happens inside the adminWrite endpoint for each
      // products / product_images write above; country-prices mirror via
      // their own route below.)

      // Country offers — persist via dedicated admin endpoint. Runs
      // BEFORE revalidation so the cache invalidation below picks up
      // the new prices. Pre-validated client-side; the server re-checks
      // against current MRP and rejects with VALIDATION_FAILED /
      // OFFER_EXCEEDS_MRP if anything slipped through.
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const payloadOffers = countryOffers
          .filter((r) => r.offer_price !== "" && Number(r.offer_price) > 0)
          .map((r) => ({
            country_code: r.country_code,
            offer_price: Number(r.offer_price),
            is_active: r.is_active,
          }));
        const res = await fetch(
          `/api/admin/products/${encodeURIComponent(model.id)}/country-prices`,
          {
            method: "PUT",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ offers: payloadOffers }),
          }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.ok === false) {
          const issues: string[] = Array.isArray(body?.issues) ? body.issues : [];
          throw new Error(
            issues.length > 0
              ? `Country offers: ${issues.join("; ")}`
              : body?.error || "Failed to save country offers"
          );
        }
      } catch (e: any) {
        // Re-throw so the outer catch surfaces the toast and the user
        // knows the offers didn't save — even though the main product
        // row already updated. Manual re-save will reconcile.
        throw new Error(e?.message || "Failed to save country offers");
      }

      // Invalidate Next.js caches so the public storefront reflects the
      // change immediately (instead of waiting up to 5 minutes for ISR).
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        await fetch("/api/admin/products/revalidate", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ productId: model.id }),
        });
      } catch {
        // Best-effort — admin still saw the save succeed locally.
      }

      // Auto-translate published products. Fire-and-forget — the
      // admin shouldn't wait for Anthropic to process 8 locales.
      // The translate API itself is diff-aware (only changed source
      // content triggers a re-run, human-edited rows are locked) so
      // it's safe to call on every save.
      if (model.is_published) {
        try {
          const { data: s } = await supabase.auth.getSession();
          const token = s?.session?.access_token;
          void fetch("/api/admin/content-translations/translate", {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ kind: "products", id: model.id }),
          }).catch(() => {});
        } catch {
          // Best-effort — translation can be re-triggered manually
          // from /admin/translations/products if anything fails.
        }
      }

      toast.success("Saved");
      if (backAfter) router.push("/admin/products");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  /* preview existing images (public bucket assumption) */
  const [publicUrls, setPublicUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    (async () => {
      if (!model) return;
      const out: Record<number, string> = {};
      await Promise.all(
        model.images.map(async (row, idx) => {
          if (row.storage_path && !row.file) {
            out[idx] = resolveMediaUrl("product-media", row.storage_path) ?? "";
          }
        })
      );
      setPublicUrls(out);
    })();
  }, [model?.images]);

  if (!model) return <div className="container mx-auto py-16 text-muted-foreground">Loading…</div>;

  return (
    <div className="container mx-auto py-6">
      <div className="mb-4">
        <Button variant="ghost" onClick={() => router.push("/admin/products")}>← Back</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Admin Edit — {model.name || "Product"}</CardTitle>
            {/* Translation coverage at-a-glance. Visible only after
                the row is saved (i.e. has an id). Hidden on unpublished
                drafts because the auto-translate hook skips them, so
                the number would always read 0/8 and confuse the admin. */}
            {model.id && model.is_published && (
              <TranslationStatusBadge kind="products" id={model.id} />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="discover">Discover</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="space-y-8 pt-4">
          {/* Vendor (read-only) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Vendor</Label>
              <Input value={vendor?.display_name || model.vendor_id || "—"} readOnly />
            </div>
            <div>
              <Label>SKU (auto if blank)</Label>
              <Input value={model.sku} onChange={e => setModel(m => m ? ({...m, sku: e.target.value}) : m)} />
            </div>
            <div>
              <Label>Slug (auto if blank)</Label>
              <Input value={model.slug} onChange={e => setModel(m => m ? ({...m, slug: e.target.value}) : m)} />
            </div>
          </section>

          {/* Identity */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input value={model.name} onChange={e => setModel(m => m ? ({...m, name: e.target.value}) : m)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Brand</Label>
                <select
                  className="w-full h-10 border rounded-md bg-background px-3"
                  value={model.brand_id}
                  onChange={(e) => setModel(m => m ? ({...m, brand_id: e.target.value}) : m)}
                >
                  <option value="">Select brand</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name || b.slug || b.id}</option>)}
                </select>
              </div>
              <div>
                <Label>Category</Label>
                <select
                  className="w-full h-10 border rounded-md bg-background px-3"
                  value={model.category_id}
                  onChange={(e) => setModel(m => m ? ({...m, category_id: e.target.value}) : m)}
                >
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name || c.slug || c.id}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Copy */}

<section className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div>
    <Label>Short description</Label>
    <Textarea
      rows={3}
      value={model.short_description}
      onChange={e =>
        setModel(m => (m ? { ...m, short_description: e.target.value } : m))
      }
    />
  </div>

  <div>
    <Label>Description (markdown)</Label>
    <Textarea
      rows={6}
      value={model.description}
      placeholder={`Example:
- High-potency vitamin C serum
- Brightens and evens skin tone
- Reduces fine lines and boosts elasticity`}
      onChange={e =>
        setModel(m => (m ? { ...m, description: e.target.value } : m))
      }
    />
    <p className="mt-1 text-xs text-muted-foreground">
      Supports basic markdown: headings, lists, **bold**, etc.
    </p>
  </div>
</section>


          {/* Pricing & Publish */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Price</Label>
              <Input type="number" min="0" step="0.01"
                value={model.price ?? ""} onChange={e => setModel(m => m ? ({...m, price: e.target.value ? Number(e.target.value) : null}) : m)} />
            </div>
            <div>
              <Label>Compare at</Label>
              <Input type="number" min="0" step="0.01"
                value={model.compare_at_price ?? ""} onChange={e => setModel(m => m ? ({...m, compare_at_price: e.target.value ? Number(e.target.value) : null}) : m)} />
            </div>
            <div>
              <Label>Sale price</Label>
              <Input type="number" min="0" step="0.01"
                value={model.sale_price ?? ""} onChange={e => setModel(m => m ? ({...m, sale_price: e.target.value ? Number(e.target.value) : null}) : m)} />
            </div>
            <div>
              <Label>Sale starts</Label>
              <Input type="datetime-local"
                value={model.sale_starts_at || ""} onChange={e => setModel(m => m ? ({...m, sale_starts_at: e.target.value}) : m)} />
            </div>
            <div>
              <Label>Sale ends</Label>
              <Input type="datetime-local"
                value={model.sale_ends_at || ""} onChange={e => setModel(m => m ? ({...m, sale_ends_at: e.target.value}) : m)} />
            </div>
            <label className="flex items-center gap-3">
              <Switch checked={model.is_published} onCheckedChange={(v) => setModel(m => m ? ({...m, is_published: v}) : m)} />
              <span>Published</span>
            </label>
          </section>

          {/* Country offers ─────────────────────────────────────────
              Per-country offer price for this product. Resolver order:
              country offer > legacy sale_price within window > legacy
              price. A country with no offer set continues to see the
              legacy fallback — no change. Saved on main product save.
              MRP reference uses `compare_at_price` above; offers must
              be > 0 and (if MRP set) < MRP. */}
          <section className="rounded-md border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Country offers (INR)</h3>
              {loadingCountryOffers && (
                <span className="text-xs text-muted-foreground">Loading…</span>
              )}
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Set an offer price per country. Empty = no offer, customer in
              that country sees the regular price.
              {model.compare_at_price != null && (
                <> Each offer must be less than the MRP (₹{model.compare_at_price}).</>
              )}
            </p>

            <div className="mb-4 flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="bulk-offer" className="text-xs">
                  Apply to all enabled countries
                </Label>
                <Input
                  id="bulk-offer"
                  type="number"
                  min="0"
                  step="0.01"
                  value={bulkOfferPrice}
                  onChange={(e) => setBulkOfferPrice(e.target.value)}
                  placeholder="e.g. 2400"
                  className="w-40"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!bulkOfferPrice}
                onClick={() => {
                  const v = bulkOfferPrice.trim();
                  if (!v) return;
                  setCountryOffers((rows) =>
                    rows.map((r) =>
                      r.is_active ? { ...r, offer_price: v } : r
                    )
                  );
                }}
              >
                Apply
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCountryOffers((rows) =>
                    rows.map((r) => ({ ...r, offer_price: "" }))
                  );
                  setBulkOfferPrice("");
                }}
              >
                Clear all
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {countryOffers.map((row, idx) => {
                const profile = COUNTRY_PROFILES[row.country_code as keyof typeof COUNTRY_PROFILES];
                const priceNum = Number(row.offer_price);
                const mrp = model.compare_at_price ?? null;
                const overMrp =
                  row.offer_price !== "" &&
                  Number.isFinite(priceNum) &&
                  mrp != null &&
                  priceNum >= Number(mrp);
                const notPositive =
                  row.offer_price !== "" &&
                  (!Number.isFinite(priceNum) || priceNum <= 0);
                const hasError = overMrp || notPositive;
                return (
                  <div
                    key={row.country_code}
                    className={`flex items-center gap-2 rounded-md border bg-background p-2 ${
                      hasError ? "border-red-300" : ""
                    }`}
                  >
                    <span className="w-8 flex justify-center" aria-hidden>
                      <CountryFlag
                        code={row.country_code}
                        className="inline-block h-5 w-auto rounded-[1px]"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {profile?.name ?? row.country_code}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.country_code}
                      </div>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.offer_price}
                      placeholder="—"
                      className="w-28"
                      onChange={(e) => {
                        const v = e.target.value;
                        setCountryOffers((rows) => {
                          const next = rows.slice();
                          next[idx] = { ...next[idx], offer_price: v };
                          return next;
                        });
                      }}
                    />
                    <label className="flex items-center gap-1 text-xs">
                      <Switch
                        checked={row.is_active}
                        onCheckedChange={(v) =>
                          setCountryOffers((rows) => {
                            const next = rows.slice();
                            next[idx] = { ...next[idx], is_active: v };
                            return next;
                          })
                        }
                      />
                      <span>Active</span>
                    </label>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">
              Saved when you click <strong>Save</strong> above. Cleared rows are
              removed from the database.
            </p>
          </section>

          {/* Badges */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              ["made_in_korea","Made in Korea"],
              ["is_vegetarian","Vegetarian"],
              ["cruelty_free","Cruelty-free"],
              ["toxin_free","Toxin-free"],
              ["paraben_free","Paraben-free"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 border rounded-md px-3 py-2">
                <Switch checked={(model as any)[key]}
                  onCheckedChange={(v)=>setModel(m=>m ? ({...m,[key]:v}) : m)} />
                <span>{label}</span>
              </label>
            ))}
          </section>

          {/* SEO / Rich */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Meta title</Label>
              <Input value={model.meta_title} onChange={e => setModel(m=>m ? ({...m, meta_title: e.target.value}) : m)} />
            </div>
            <div>
              <Label>Meta description</Label>
              <Textarea rows={3} value={model.meta_description} onChange={e => setModel(m=>m ? ({...m, meta_description: e.target.value}) : m)} />
            </div>
            <div>
              <Label>What's in the Box (markdown)</Label>
              <Textarea
                rows={4}
                placeholder={"- 1× Product (50 ml)\n- 1× Spatula\n- Instruction leaflet"}
                value={model.box_contents_md}
                onChange={e => setModel(m=>m ? ({...m, box_contents_md: e.target.value}) : m)}
              />
            </div>
            <div>
              <Label>Ingredients (markdown)</Label>
              <Textarea rows={4} value={model.ingredients_md} onChange={e => setModel(m=>m ? ({...m, ingredients_md: e.target.value}) : m)} />
            </div>
            <div>
              <Label>Key features (markdown)</Label>
              <Textarea rows={4} value={model.key_features_md} onChange={e => setModel(m=>m ? ({...m, key_features_md: e.target.value}) : m)} />
            </div>
            <div>
              <Label>Additional details (markdown)</Label>
              <Textarea rows={4} value={model.additional_details_md} onChange={e => setModel(m=>m ? ({...m, additional_details_md: e.target.value}) : m)} />
            </div>
            <div>
              <Label>Attributes (JSON)</Label>
              <Textarea rows={4} value={model.attributes_json} onChange={e => setModel(m=>m ? ({...m, attributes_json: e.target.value}) : m)} />
            </div>
            <div>
              <Label>FAQ (Q::A pairs, separated by ||)</Label>
              <Textarea rows={3} value={model.faq_text} onChange={e => setModel(m=>m ? ({...m, faq_text: e.target.value}) : m)} />
            </div>
            <div>
              <Label>Key benefits (separate with |)</Label>
              <Input value={model.key_benefits_text} onChange={e=>setModel(m=>m ? ({...m, key_benefits_text: e.target.value}) : m)} />
            </div>
          </section>

          {/* Misc */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Volume (ml)</Label>
              <Input type="number" min="0" step="0.01"
                value={model.volume_ml ?? ""} onChange={e => setModel(m => m ? ({...m, volume_ml: e.target.value ? Number(e.target.value) : null}) : m)} />
            </div>
            <div>
              <Label>Net weight (g)</Label>
              <Input type="number" min="0" step="0.01"
                value={model.net_weight_g ?? ""} onChange={e => setModel(m => m ? ({...m, net_weight_g: e.target.value ? Number(e.target.value) : null}) : m)} />
              <p className="text-xs text-muted-foreground mt-1">Contents only — informational.</p>
            </div>
            <div>
              <Label>Gross weight (g)</Label>
              <Input type="number" min="0" step="0.01"
                value={model.gross_weight_g ?? ""} onChange={e => setModel(m => m ? ({...m, gross_weight_g: e.target.value ? Number(e.target.value) : null}) : m)} />
              <p className="text-xs text-muted-foreground mt-1">With retail packaging — drives shipping math.</p>
            </div>
            <div>
              <Label>Country of origin</Label>
              <Input value={model.country_of_origin} onChange={e=>setModel(m=>m ? ({...m, country_of_origin: e.target.value}) : m)} />
            </div>
          </section>

          {/* Admin-only controls */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="flex items-center gap-3">
              <Switch checked={model.is_featured} onCheckedChange={(v)=>setModel(m=>m ? ({...m, is_featured: v}) : m)} />
              <span>Featured</span>
            </label>
            <div>
              <Label>Featured rank</Label>
              <Input type="number" min="0"
                value={model.featured_rank === "" ? "" : (model.featured_rank as number)}
                onChange={e => setModel(m => m ? ({...m, featured_rank: e.target.value === "" ? "" : Number(e.target.value)}) : m)}
                placeholder="leave blank for none"
              />
            </div>
            <label className="flex items-center gap-3">
              <Switch checked={model.is_trending} onCheckedChange={(v)=>setModel(m=>m ? ({...m, is_trending: v}) : m)} />
              <span>Trending</span>
            </label>
            <label className="flex items-center gap-3">
              <Switch checked={model.is_bundle} onCheckedChange={(v)=>setModel(m=>m ? ({...m, is_bundle: v}) : m)} />
              <span>Bundle</span>
            </label>
            <div>
              <Label>New until</Label>
              <Input type="date" value={model.new_until}
                onChange={e => setModel(m => m ? ({...m, new_until: e.target.value}) : m)} />
            </div>
          </section>

          {/* Media */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Images (up to 5)</h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={overwriteStorage} onCheckedChange={setOverwriteStorage} />
                  <span>Overwrite storage files</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={deleteMediaFromStorage} onCheckedChange={setDeleteMediaFromStorage} />
                  <span>Delete files from storage on remove</span>
                </label>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {model.images.map((row, idx) => (
                <div key={idx} className={`rounded-lg border p-3 ${row.remove ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Image #{idx + 1}</div>
                    <Button variant="ghost" size="sm" onClick={() => removeImageSlot(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  <div className="mb-2">
                    {row.file ? (
                      <div className="text-xs text-muted-foreground">{row.file.name}</div>
                    ) : row.storage_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={publicUrls[idx]} alt="" className="h-24 w-24 object-cover rounded border" />
                    ) : (
                      <div className="text-xs text-muted-foreground">No file selected</div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <Label>Choose image</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setModel(m => {
                            if (!m) return m;
                            const copy = [...m.images];
                            copy[idx] = { ...copy[idx], file: f, storage_path: undefined };
                            return { ...m, images: copy };
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label>ALT text</Label>
                      <Input
                        value={row.alt}
                        onChange={(e) => setModel(m => {
                          if (!m) return m;
                          const copy = [...m.images]; copy[idx] = { ...copy[idx], alt: e.target.value }; return { ...m, images: copy };
                        })}
                      />
                    </div>
                    <div>
                      <Label>Sort order</Label>
                      <Input
                        type="number" min="0"
                        value={row.sort_order}
                        onChange={(e) => setModel(m => {
                          if (!m) return m;
                          const v = Number(e.target.value) || 0;
                          const copy = [...m.images]; copy[idx] = { ...copy[idx], sort_order: v }; return { ...m, images: copy };
                        })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {model.images.filter(x => !x.remove).length < 5 && (
              <Button variant="outline" onClick={addImageSlot}>
                <Plus className="h-4 w-4 mr-2" /> Add Image
              </Button>
            )}

            <div className="pt-2">
              <h3 className="text-lg font-medium mb-2">Video (optional)</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Choose video</Label>
                  <Input
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={(e) => setModel(m => m ? ({...m, video_file: e.target.files?.[0] || null, remove_video: false}) : m)}
                  />
                  {model.video_path && !model.video_file && (
                    <div className="mt-1 text-xs text-muted-foreground break-all">
                      Existing: {model.video_path}
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-3">
                  <Switch checked={!!model.remove_video}
                    onCheckedChange={(v) => setModel(m => m ? ({...m, remove_video: v, video_file: v ? null : m.video_file}) : m)} />
                  <span>Remove existing video</span>
                </label>
              </div>

              {/* Preview block. Shows the file the admin just picked (via
                  a local Blob URL) when present; otherwise plays the
                  existing video already on the product. `object-contain`
                  + bg-black preserves the video's native aspect ratio
                  (portrait videos get side letterbox, landscape gets
                  top/bottom letterbox) so the admin sees exactly what
                  will render on the storefront. */}
              {(model.video_file || (model.video_path && !model.remove_video)) && (
                <div className="mt-3 max-w-md">
                  <div className="text-xs text-muted-foreground mb-1">
                    {model.video_file ? "Preview (new upload)" : "Preview (current)"}
                  </div>
                  <div className="relative aspect-video rounded-md overflow-hidden bg-black">
                    <video
                      key={model.video_file ? "new-upload" : model.video_path || "existing"}
                      src={
                        model.video_file
                          ? URL.createObjectURL(model.video_file)
                          : resolveMediaUrl("product-media", model.video_path) ?? ""
                      }
                      controls
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Save */}
          <div className="flex gap-2">
            <Button onClick={() => onSave(false)} disabled={busy || !canSave}>
              <Upload className="h-4 w-4 mr-2" /> Save
            </Button>
            <Button variant="secondary" onClick={() => onSave(true)} disabled={busy || !canSave}>
              Save & Back
            </Button>
          </div>
            </TabsContent>
            <TabsContent value="discover" className="pt-4">
              <ProductStoryEditor productId={model.id} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
