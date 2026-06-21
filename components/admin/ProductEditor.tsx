"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea"; // if you don't have one, replace with <textarea className="...">
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import ProductStoryEditor from "@/components/admin/ProductStoryEditor";
import { uploadMedia, deleteMedia } from "@/lib/storage/upload-client";
import { resolveMediaUrl } from "@/lib/storage/backend";
import { adminWrite } from "@/lib/admin/catalog-write";

/* ──────────────────────────────────────────────────────────────
   Supabase
   ────────────────────────────────────────────────────────────── */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

/* ──────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────── */
function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function skuify(s: string) {
  return s
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
function safeKeyPart(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function parseBool(v: any) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(s);
}

type VendorInfo = { id: string; display_name: string; status: "pending"|"approved"|"rejected"|"disabled" };
type BrandRow = { id: string; slug?: string|null; name?: string|null };
type CategoryRow = { id: string; slug?: string|null; name?: string|null };

type ImageRow = {
  id?: string;          // product_images.id (existing)
  file?: File;          // new upload
  storage_path?: string; // existing path in bucket (e.g. sku/file.jpg)
  alt: string;
  sort_order: number;
  // UI flags
  remove?: boolean;     // delete this image row from DB
};

// Mirrors ImageRow but for the new product_videos table. Lets the
// admin attach as many videos as they want to a product instead of
// the previous single `products.video_path` slot.
type VideoRow = {
  id?: string;            // product_videos.id (existing rows)
  file?: File;            // new upload (admin just picked the file)
  storage_path?: string;  // existing bucket-relative path
  alt: string;
  sort_order: number;
  remove?: boolean;
};

type ProductModel = {
  id?: string;
  vendor_id?: string;
  sku: string;
  slug: string;
  name: string;
  brand_id: string | "";
  category_id: string | "";
  price: number | null;
  currency: string;
  short_description: string;
  description: string;
  // publish & price
  is_published: boolean;
  compare_at_price: number | null;
  sale_price: number | null;
  sale_starts_at: string | "";
  sale_ends_at: string | "";
  // badges
  made_in_korea: boolean;
  is_vegetarian: boolean;
  cruelty_free: boolean;
  toxin_free: boolean;
  paraben_free: boolean;
  // SEO / rich
  meta_title: string;
  meta_description: string;
  ingredients_md: string;
  key_features_md: string;
  additional_details_md: string;
  box_contents_md: string;
  attributes_json: string; // JSON text, parsed to jsonb
  faq_text: string;        // "Q?::A||Q2?::A2" (converted to jsonb)
  key_benefits_text: string; // "Hydrating|Soothing" (converted to text[])
  // misc
  volume_ml: number | null;
  net_weight_g: number | null;
  gross_weight_g: number | null;
  country_of_origin: string;
  // media (derived or selected)
  images: ImageRow[]; // up to 5
  // Multiple videos per product. Backed by the `product_videos` table.
  // `video_file` / `video_path` / `remove_video` below are kept for
  // one release as a fallback for the legacy single-video column on
  // `products`; everything new flows through `videos[]`.
  videos: VideoRow[];
  video_file?: File | null;
  video_path?: string | null; // existing video (legacy)
  remove_video?: boolean;     // legacy
};

export function ProductEditor({
  mode,           // "create" | "edit"
  productId,      // required if mode === "edit"
}: {
  mode: "create" | "edit";
  productId?: string;
}) {
  const router = useRouter();

  // vendor + lookups
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  // form state
  const [model, setModel] = useState<ProductModel>(() => ({
    sku: "",
    slug: "",
    name: "",
    brand_id: "",
    category_id: "",
    price: null,
    currency: "INR",
    short_description: "",
    description: "",

    is_published: true,
    compare_at_price: null,
    sale_price: null,
    sale_starts_at: "",
    sale_ends_at: "",

    made_in_korea: false,
    is_vegetarian: false,
    cruelty_free: false,
    toxin_free: false,
    paraben_free: false,

    meta_title: "",
    meta_description: "",
    ingredients_md: "",
    key_features_md: "",
    additional_details_md: "",
    box_contents_md: "",
    attributes_json: "{}",        // jsonb NOT NULL in your schema
    faq_text: "",
    key_benefits_text: "",

    volume_ml: null,
    net_weight_g: null,
    gross_weight_g: null,
    country_of_origin: "",

    images: [],
    videos: [],
    video_file: null,
    video_path: null,
    remove_video: false,
  }));

  const [busy, setBusy] = useState(false);
  const [overwriteStorage, setOverwriteStorage] = useState(false);
  const [deleteMediaFromStorage, setDeleteMediaFromStorage] = useState(false);

  // hydrate vendor + lookups + (edit) product
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.replace("/vendor/login"); return; }

      const { data: rpc, error: rpcErr } = await supabase.rpc("get_my_vendor");
      if (rpcErr) { toast.error(rpcErr.message); router.replace("/vendor"); return; }
      const vArr = Array.isArray(rpc) ? rpc : rpc ? [rpc] : [];
      const v = vArr[0] as VendorInfo | undefined;
      if (!v) { router.replace("/vendor/register"); return; }
      if (v.status !== "approved") { router.replace("/vendor"); return; }
      if (cancelled) return;
      setVendor(v);

      const [br, cat] = await Promise.all([
        supabase.from("brands").select("id,slug,name").order("name", { ascending: true }),
        supabase.from("categories").select("id,slug,name").order("name", { ascending: true }),
      ]);
      if (!cancelled) {
        setBrands((br.data as any[]) || []);
        setCategories((cat.data as any[]) || []);
      }

      if (mode === "edit" && productId) {
        // Only load product owned by this vendor
        const { data: prod, error: perr } = await supabase
          .from("products")
          .select("*")
          .eq("id", productId)
          .eq("vendor_id", v.id)
          .maybeSingle();

        if (perr) { toast.error(perr.message); return; }
        if (!prod) { toast.error("Product not found"); router.replace("/vendor/products"); return; }

        // Load gallery images
        const { data: imgs } = await supabase
          .from("product_images")
          .select("id, storage_path, alt, sort_order")
          .eq("product_id", productId)
          .order("sort_order", { ascending: true });

        // Load gallery videos (new multi-video table). Legacy single
        // video on `products.video_path` is still surfaced as the
        // `video_path` field below for backward compatibility, but
        // new uploads go through this list.
        const { data: vids } = await supabase
          .from("product_videos")
          .select("id, storage_path, alt, sort_order")
          .eq("product_id", productId)
          .order("sort_order", { ascending: true });

        setModel((m) => ({
          ...m,
          id: prod.id,
          vendor_id: prod.vendor_id,
          sku: prod.sku || "",
          slug: prod.slug || "",
          name: prod.name || "",
          brand_id: prod.brand_id || "",
          category_id: prod.category_id || "",
          price: prod.price ?? null,
          currency: prod.currency || "INR",
          short_description: prod.short_description || "",
          description: prod.description || "",
          is_published: parseBool(prod.is_published),
          compare_at_price: prod.compare_at_price ?? null,
          sale_price: prod.sale_price ?? null,
          sale_starts_at: prod.sale_starts_at || "",
          sale_ends_at: prod.sale_ends_at || "",
          made_in_korea: parseBool(prod.made_in_korea),
          is_vegetarian: parseBool(prod.is_vegetarian),
          cruelty_free: parseBool(prod.cruelty_free),
          toxin_free: parseBool(prod.toxin_free),
          paraben_free: parseBool(prod.paraben_free),
          meta_title: prod.meta_title || "",
          meta_description: prod.meta_description || "",
          ingredients_md: prod.ingredients_md || "",
          key_features_md: prod.key_features_md || "",
          additional_details_md: prod.additional_details_md || "",
          box_contents_md: prod.box_contents_md || "",
          attributes_json: JSON.stringify(prod.attributes ?? {}, null, 0),
          faq_text: ((prod.faq ?? []) as any[])
            .map((x: any) => `${x?.q ?? ""}::${x?.a ?? ""}`).filter(Boolean).join("||"),
          key_benefits_text: ((prod.key_benefits ?? []) as any[]).join("|"),
          volume_ml: prod.volume_ml ?? null,
          net_weight_g: prod.net_weight_g ?? null,
          gross_weight_g: prod.gross_weight_g ?? null,
          country_of_origin: prod.country_of_origin || "",
          video_path: prod.video_path ?? null,
          images: (imgs ?? []).map((r) => ({
            id: r.id, storage_path: r.storage_path, alt: r.alt ?? "", sort_order: r.sort_order ?? 0,
          })),
          videos: (vids ?? []).map((r) => ({
            id: r.id,
            storage_path: r.storage_path,
            alt: r.alt ?? "",
            sort_order: r.sort_order ?? 0,
          })),
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [mode, productId, router]);

  const addImageSlot = () => {
    setModel((m) => {
      if (m.images.length >= 5) return m;
      const nextSort = (m.images[m.images.length - 1]?.sort_order ?? -1) + 1;
      return { ...m, images: [...m.images, { alt: "", sort_order: Math.max(0, nextSort) }] };
    });
  };

  const removeImageSlot = (idx: number) => {
    setModel((m) => {
      const copy = [...m.images];
      const row = copy[idx];
      if (row?.id) {
        // existing row → mark remove
        copy[idx] = { ...row, remove: true };
      } else {
        copy.splice(idx, 1);
      }
      return { ...m, images: copy };
    });
  };

  // Video slot management — mirrors the image versions but with no
  // upper cap (admins can attach as many videos as they want now).
  const addVideoSlot = () => {
    setModel((m) => {
      const nextSort = (m.videos[m.videos.length - 1]?.sort_order ?? -1) + 1;
      return {
        ...m,
        videos: [
          ...m.videos,
          { alt: "", sort_order: Math.max(0, nextSort) },
        ],
      };
    });
  };

  const removeVideoSlot = (idx: number) => {
    setModel((m) => {
      const copy = [...m.videos];
      const row = copy[idx];
      if (row?.id) {
        // existing row → mark remove (delete from DB on save)
        copy[idx] = { ...row, remove: true };
      } else {
        copy.splice(idx, 1);
      }
      return { ...m, videos: copy };
    });
  };

  const canSave = useMemo(() => {
    return !!model.name && !!(model.brand_id) && !!(model.category_id);
  }, [model]);

  /* ── Save (create/update + media) ── */
  const onSave = async (closeAfter = false) => {
    if (!vendor) { toast.error("Vendor not ready"); return; }
    if (!canSave) { toast.error("Please fill name, brand and category"); return; }
    // Gross weight is mandatory before a product can go live — shipping
    // math (India DTDC + international EMS slabs) reads from it. Drafts
    // may be saved without it so works-in-progress aren't blocked.
    if (model.is_published) {
      const w = Number(model.gross_weight_g ?? 0);
      if (!Number.isFinite(w) || w <= 0) {
        toast.error(
          "Gross weight (g) is required to publish — used to compute shipping."
        );
        return;
      }
    }
    setBusy(true);
    try {
      // 1) Normalize identity
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

      // 2) Build base product payload
      const payload: any = {
        sku,
        slug,
        name: model.name,
        brand_id: model.brand_id || null,
        category_id: model.category_id || null,

        short_description: model.short_description || null,
        description: model.description || null,

        price: model.price ?? null,
        currency: model.currency || "INR",
        compare_at_price: model.compare_at_price ?? null,
        sale_price: model.sale_price ?? null,
        sale_starts_at: model.sale_starts_at || null,
        sale_ends_at: model.sale_ends_at || null,
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
        attributes: (() => {
          try { return JSON.parse(model.attributes_json || "{}"); } catch { return {}; }
        })(),
        faq: (model.faq_text || "")
          .split("||")
          .map((pair) => {
            const [q, a] = pair.split("::").map((x) => (x ?? "").trim());
            if (!q && !a) return null;
            return { q, a };
          })
          .filter(Boolean),
        key_benefits: (model.key_benefits_text || "")
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean),

        volume_ml: model.volume_ml ?? null,
        net_weight_g: model.net_weight_g ?? null,
        gross_weight_g: model.gross_weight_g ?? null,
        country_of_origin: model.country_of_origin || null,
      };

      if (mode === "create") payload.vendor_id = vendor.id;

      // 3) Upsert product (first, without media paths)
      let prodId = model.id;
      if (mode === "create") {
        const row = await adminWrite({ table: "products", op: "insert", data: payload });
        prodId = row?.id;
      } else {
        const row = await adminWrite({
          table: "products",
          op: "update",
          data: payload,
          match: { id: productId, vendor_id: vendor.id },
        });
        prodId = row?.id;
      }
      if (!prodId) throw new Error("No product id");

      // 4) Media handling
      // 4a) Upload new images, build rows
      const bucket = "product-media";
      const safeSku = safeKeyPart(sku);
      const imgRows: { product_id: string; storage_path: string; alt: string|null; sort_order: number }[] = [];
      const toDeleteImgIds: string[] = [];

      for (const row of model.images) {
        if (row.remove && row.id) {
          toDeleteImgIds.push(row.id);
          continue;
        }
        let storage_path = row.storage_path;
        if (row.file) {
          const cleanName = safeKeyPart(row.file.name);
          const key = `${safeSku}/${cleanName}`;
          try {
            const { path } = await uploadMedia(bucket, key, row.file, { upsert: overwriteStorage });
            storage_path = path;
          } catch (upErr: any) {
            if (upErr?.message?.includes("already exists") && !overwriteStorage) {
              throw new Error(`Image already exists in storage: ${key}`);
            }
            throw upErr;
          }
        }
        if (storage_path) {
          imgRows.push({
            product_id: prodId,
            storage_path,
            alt: row.alt || null,
            sort_order: Number.isFinite(row.sort_order as any) ? (row.sort_order as number) : 0,
          });
        }
      }

      // 4b) Apply image deletions
      if (toDeleteImgIds.length) {
        // Capture storage paths BEFORE deleting (rows are gone after delete).
        let imgPaths: string[] = [];
        if (deleteMediaFromStorage) {
          const { data: gone } = await supabase
            .from("product_images")
            .select("storage_path")
            .in("id", toDeleteImgIds);
          imgPaths = (gone ?? []).map((g: any) => g.storage_path);
        }

        for (const delId of toDeleteImgIds) {
          await adminWrite({
            table: "product_images",
            op: "delete",
            match: { id: delId },
            mirrorScope: prodId,
          });
        }

        if (deleteMediaFromStorage) {
          for (const p of imgPaths) {
            if (p) await deleteMedia(bucket, p);
          }
        }
      }

      // 4c) Upsert images (unique index product_id,storage_path recommended)
      if (imgRows.length) {
        await adminWrite({
          table: "product_images",
          op: "upsert",
          data: imgRows,
          onConflict: "product_id,storage_path",
        });
      }

      // 4d) Video: upload or remove
      let nextVideoPath = model.video_path || null;
      if (model.remove_video) {
        await adminWrite({
          table: "products",
          op: "update",
          data: { video_path: null },
          match: { id: prodId, vendor_id: vendor.id },
        });
        if (deleteMediaFromStorage && model.video_path) {
          await deleteMedia(bucket, model.video_path);
        }
        nextVideoPath = null;
      } else if (model.video_file) {
        const cleanVid = safeKeyPart(model.video_file.name);
        const key = `${safeSku}/video/${cleanVid}`;
        let videoPath: string;
        try {
          const { path } = await uploadMedia(bucket, key, model.video_file, { upsert: overwriteStorage });
          videoPath = path;
        } catch (vErr: any) {
          if (vErr?.message?.includes("already exists") && !overwriteStorage) {
            throw new Error(`Video already exists in storage: ${key}`);
          }
          throw vErr;
        }
        nextVideoPath = videoPath;
        await adminWrite({
          table: "products",
          op: "update",
          data: { video_path: videoPath },
          match: { id: prodId, vendor_id: vendor.id },
        });
      }

      // 4d-multi) `product_videos` table — N videos per product.
      // Mirrors the image save block above: build the upsert payload
      // from new files + existing rows, collect remove ids separately,
      // then issue the delete + upsert in one shot each.
      const vidRows: {
        product_id: string;
        storage_path: string;
        alt: string | null;
        sort_order: number;
      }[] = [];
      const toDeleteVidIds: string[] = [];
      for (const row of model.videos) {
        if (row.remove && row.id) {
          toDeleteVidIds.push(row.id);
          continue;
        }
        let storage_path = row.storage_path;
        if (row.file) {
          const cleanName = safeKeyPart(row.file.name);
          const key = `${safeSku}/videos/${cleanName}`;
          try {
            const { path } = await uploadMedia(bucket, key, row.file, { upsert: overwriteStorage });
            storage_path = path;
          } catch (upErr: any) {
            if (upErr?.message?.includes("already exists") && !overwriteStorage) {
              throw new Error(`Video already exists in storage: ${key}`);
            }
            throw upErr;
          }
        }
        if (storage_path) {
          vidRows.push({
            product_id: prodId!,
            storage_path,
            alt: row.alt?.trim() || null,
            sort_order: row.sort_order ?? 0,
          });
        }
      }

      if (toDeleteVidIds.length) {
        // Best-effort: also drop the storage blobs if the admin asked
        // for media cleanup.
        if (deleteMediaFromStorage) {
          const { data: goneVid } = await supabase
            .from("product_videos")
            .select("storage_path")
            .in("id", toDeleteVidIds);
          const paths = (goneVid ?? []).map((g: any) => g.storage_path);
          for (const p of paths) {
            if (p) await deleteMedia(bucket, p);
          }
        }
        for (const delId of toDeleteVidIds) {
          await adminWrite({
            table: "product_videos",
            op: "delete",
            match: { id: delId },
            mirrorScope: prodId,
          });
        }
      }

      if (vidRows.length) {
        await adminWrite({
          table: "product_videos",
          op: "upsert",
          data: vidRows,
          onConflict: "product_id,storage_path",
        });
      }

      // 4e) Derive hero/og from first two images if we *submitted* any images this run
      if (imgRows.length) {
        const sorted = imgRows.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const hero = sorted[0]?.storage_path ?? null;
        const og   = sorted[1]?.storage_path ?? null;
        await adminWrite({
          table: "products",
          op: "update",
          data: { hero_image_path: hero, og_image_path: og },
          match: { id: prodId, vendor_id: vendor.id },
        });
      }

      // MySQL re-sync is now handled server-side by the catalog/write
      // endpoint for each write above (products + product_images +
      // product_videos), so no explicit mirrorMysql calls are needed.

      toast.success(mode === "create" ? "Product created" : "Product saved");
      if (closeAfter) router.push("/vendor/products");
      else if (mode === "create") router.push(`/vendor/products/${prodId}`);
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  // previews for existing storage images (public bucket or signed if needed)
  const [publicUrls, setPublicUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    (async () => {
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
  }, [model.images]);

  if (!vendor) return <div className="container mx-auto py-16 text-muted-foreground">Loading…</div>;

  return (
    <div className="container mx-auto py-6">
      <div className="mb-4">
        <Button variant="ghost" onClick={() => router.push("/vendor/products")}>← Back</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "create" ? "Add Product" : "Edit Product"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="discover">Discover</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="space-y-8 pt-4">
          {/* Identity */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input value={model.name} onChange={e => setModel(m => ({...m, name: e.target.value}))} />
            </div>
            <div>
              <Label>Slug (leave blank to auto-generate)</Label>
              <Input value={model.slug} onChange={e => setModel(m => ({...m, slug: e.target.value}))} />
            </div>
            <div>
              <Label>SKU (leave blank to auto-generate)</Label>
              <Input value={model.sku} onChange={e => setModel(m => ({...m, sku: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Brand</Label>
                <select
                  className="w-full h-10 border rounded-md bg-background px-3"
                  value={model.brand_id}
                  onChange={(e) => setModel(m => ({...m, brand_id: e.target.value}))}
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
                  onChange={(e) => setModel(m => ({...m, category_id: e.target.value}))}
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
              <Textarea rows={3} value={model.short_description}
                onChange={e => setModel(m => ({...m, short_description: e.target.value}))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={6} value={model.description}
                onChange={e => setModel(m => ({...m, description: e.target.value}))} />
            </div>
          </section>

          {/* Pricing & Publish */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Price</Label>
              <Input type="number" min="0" step="0.01"
                value={model.price ?? ""} onChange={e => setModel(m => ({...m, price: e.target.value ? Number(e.target.value) : null}))} />
            </div>
            <div>
              <Label>Compare at price</Label>
              <Input type="number" min="0" step="0.01"
                value={model.compare_at_price ?? ""} onChange={e => setModel(m => ({...m, compare_at_price: e.target.value ? Number(e.target.value) : null}))} />
            </div>
            <div>
              <Label>Sale price</Label>
              <Input type="number" min="0" step="0.01"
                value={model.sale_price ?? ""} onChange={e => setModel(m => ({...m, sale_price: e.target.value ? Number(e.target.value) : null}))} />
            </div>
            <div>
              <Label>Sale starts at</Label>
              <Input type="datetime-local"
                value={model.sale_starts_at || ""} onChange={e => setModel(m => ({...m, sale_starts_at: e.target.value}))} />
            </div>
            <div>
              <Label>Sale ends at</Label>
              <Input type="datetime-local"
                value={model.sale_ends_at || ""} onChange={e => setModel(m => ({...m, sale_ends_at: e.target.value}))} />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={model.is_published}
                onCheckedChange={(v) => setModel(m => ({...m, is_published: v}))} />
              <Label className="!m-0">Published</Label>
            </div>
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
                  onCheckedChange={(v)=>setModel(m=>({...m,[key]:v}))} />
                <span>{label}</span>
              </label>
            ))}
          </section>

          {/* SEO / Rich */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Meta title</Label>
              <Input value={model.meta_title} onChange={e => setModel(m=>({...m, meta_title: e.target.value}))} />
            </div>
            <div>
              <Label>Meta description</Label>
              <Textarea rows={3} value={model.meta_description} onChange={e => setModel(m=>({...m, meta_description: e.target.value}))} />
            </div>
            <div>
              <Label>What's in the Box (markdown)</Label>
              <Textarea
                rows={4}
                placeholder={"- 1× Product (50 ml)\n- 1× Spatula\n- Instruction leaflet"}
                value={model.box_contents_md}
                onChange={e => setModel(m=>({...m, box_contents_md: e.target.value}))}
              />
            </div>
            <div>
              <Label>Ingredients (markdown)</Label>
              <Textarea rows={4} value={model.ingredients_md} onChange={e => setModel(m=>({...m, ingredients_md: e.target.value}))} />
            </div>
            <div>
              <Label>Key features (markdown)</Label>
              <Textarea rows={4} value={model.key_features_md} onChange={e => setModel(m=>({...m, key_features_md: e.target.value}))} />
            </div>
            <div>
              <Label>Additional details (markdown)</Label>
              <Textarea rows={4} value={model.additional_details_md} onChange={e => setModel(m=>({...m, additional_details_md: e.target.value}))} />
            </div>
            <div>
              <Label>Attributes (JSON)</Label>
              <Textarea rows={4} value={model.attributes_json} onChange={e => setModel(m=>({...m, attributes_json: e.target.value}))} />
            </div>
            <div>
              <Label>FAQ (Q::A pairs, separated by ||)</Label>
              <Textarea rows={3} value={model.faq_text} onChange={e => setModel(m=>({...m, faq_text: e.target.value}))} />
            </div>
            <div>
              <Label>Key benefits (separate with |)</Label>
              <Input value={model.key_benefits_text} onChange={e=>setModel(m=>({...m, key_benefits_text: e.target.value}))} />
            </div>
          </section>

          {/* Misc */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Volume (ml)</Label>
              <Input type="number" min="0" step="0.01"
                value={model.volume_ml ?? ""} onChange={e => setModel(m => ({...m, volume_ml: e.target.value ? Number(e.target.value) : null}))} />
            </div>
            <div>
              <Label>Net weight (g)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={model.net_weight_g ?? ""}
                onChange={(e) =>
                  setModel((m) => ({
                    ...m,
                    net_weight_g: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Contents only (no packaging). Informational — shown on the
                product page for label compliance.
              </p>
            </div>
            <div>
              <Label>
                Gross weight (g)
                {model.is_published && (
                  <span className="text-red-600 ml-1" aria-hidden>*</span>
                )}
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                required={!!model.is_published}
                aria-invalid={
                  model.is_published &&
                  (!model.gross_weight_g || Number(model.gross_weight_g) <= 0)
                }
                value={model.gross_weight_g ?? ""}
                onChange={(e) =>
                  setModel((m) => ({
                    ...m,
                    gross_weight_g: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Including retail packaging (bottle, box, label). Required for
                published products — drives India + international shipping
                fees. Keep this accurate.
              </p>
            </div>
            <div>
              <Label>Country of origin</Label>
              <Input value={model.country_of_origin} onChange={e=>setModel(m=>({...m, country_of_origin: e.target.value}))} />
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

                  {/* Preview if existing path or newly chosen */}
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

            {/* Multi-video — N slots per product. Mirrors the image
                layout above; each row gets its own file picker + alt
                + remove button. Reorder by editing the sort_order
                input. */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-medium">
                  Videos
                  <span className="text-xs text-muted-foreground ml-2">
                    ({model.videos.filter((v) => !v.remove).length} added)
                  </span>
                </h3>
                <Button variant="outline" size="sm" onClick={addVideoSlot}>
                  <Plus className="h-4 w-4 mr-2" /> Add Video
                </Button>
              </div>

              <div className="grid gap-3">
                {model.videos.map((row, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border p-3 ${row.remove ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">
                        Video #{idx + 1}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeVideoSlot(idx)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="mb-2 text-xs text-muted-foreground">
                      {row.file
                        ? `New: ${row.file.name}`
                        : row.storage_path
                        ? `Existing: ${row.storage_path}`
                        : "No file selected"}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                      <div>
                        <Label>Choose video</Label>
                        <Input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setModel((m) => {
                              const copy = [...m.videos];
                              copy[idx] = {
                                ...copy[idx],
                                file: f,
                                storage_path: undefined,
                              };
                              return { ...m, videos: copy };
                            });
                          }}
                        />
                      </div>
                      <div>
                        <Label>Alt text (optional)</Label>
                        <Input
                          value={row.alt}
                          onChange={(e) =>
                            setModel((m) => {
                              const copy = [...m.videos];
                              copy[idx] = { ...copy[idx], alt: e.target.value };
                              return { ...m, videos: copy };
                            })
                          }
                          placeholder="Short description"
                        />
                      </div>
                      <div>
                        <Label>Order</Label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={row.sort_order}
                          onChange={(e) =>
                            setModel((m) => {
                              const copy = [...m.videos];
                              copy[idx] = {
                                ...copy[idx],
                                sort_order: Math.max(
                                  0,
                                  Number(e.target.value) || 0
                                ),
                              };
                              return { ...m, videos: copy };
                            })
                          }
                          className="w-20"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {model.videos.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No videos attached. Click <strong>Add Video</strong> to
                    upload one (or more).
                  </p>
                )}
              </div>
            </div>

            {/* Legacy single video slot — kept for one release so the
                old `products.video_path` column stays editable while
                we transition. New uploads should go through the
                multi-video list above. */}
            <div className="pt-4 border-t">
              <h3 className="text-base font-medium mb-1 text-muted-foreground">
                Legacy single video
              </h3>
              <p className="text-xs text-muted-foreground mb-2">
                Older field, kept for compatibility. Prefer the
                multi-video list above for new uploads.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Choose video</Label>
                  <Input
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={(e) => setModel(m => ({...m, video_file: e.target.files?.[0] || null, remove_video: false}))}
                  />
                  {model.video_path && !model.video_file && (
                    <div className="mt-1 text-xs text-muted-foreground">Existing: {model.video_path}</div>
                  )}
                </div>
                <label className="flex items-center gap-3 mt-6">
                  <Switch checked={!!model.remove_video}
                    onCheckedChange={(v) => setModel(m => ({...m, remove_video: v, video_file: v ? null : m.video_file}))} />
                  <span>Remove existing video</span>
                </label>
              </div>
            </div>
          </section>

          {/* Save buttons */}
          <div className="flex gap-2">
            <Button onClick={() => onSave(false)} disabled={busy || !canSave}>
              <Upload className="h-4 w-4 mr-2" /> Save
            </Button>
            <Button variant="secondary" onClick={() => onSave(true)} disabled={busy || !canSave}>
              Save & Close
            </Button>
          </div>
            </TabsContent>
            <TabsContent value="discover" className="pt-4">
              <ProductStoryEditor productId={model.id || ""} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
