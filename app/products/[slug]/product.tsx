"use client";

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations, useLocale } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  mergeTranslation,
  PRODUCT_TRANSLATABLE_FIELDS,
} from "@/lib/contentTranslations";

import {
  Heart,
  ShoppingCart,
  Star,
  Truck,
  Package,
  RotateCcw,
  Shield,
  Share2,
  Maximize2,
  Plane,
  Leaf,
  HeartHandshake,
  ShieldCheck,
  CircleSlash,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  X,
  Trash2,
  Edit3,
  EyeOff,
  Eye,
  Copy,
  Link as LinkIcon,
  Mail,
  MessageCircle,
  Send,
  PlayCircle,
  Check,
  Plus,
  Minus,
} from "lucide-react";
import Link from "next/link";
import { CustomerLayout } from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useShippingConfig } from "@/lib/hooks/useShippingConfig";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCart } from "@/lib/contexts/CartContext";
import { useWishlist } from "@/lib/contexts/WishlistContext";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import { toast } from "sonner";
import { ProductCard } from "@/components/ProductCard";
import { ProductStorySection } from "@/components/products/ProductStorySection";
import { MobileBuyBar } from "@/components/products/MobileBuyBar";
import type { StoryBlock } from "@/lib/types/productStory";
import { supabase } from "@/lib/supabaseClient";
import { uploadMedia } from "@/lib/storage/upload-client";
import { resolveMediaUrl } from "@/lib/storage/backend";
import {
  fetchCountryOffers,
  effectivePriceForCountry,
  augmentProductsWithCountryOffers,
} from "@/lib/pricing";
import { isSupportedCountry, DEFAULT_COUNTRY, COUNTRY_PROFILES } from "@/lib/countries";
import { CountryFlag } from "@/components/CountryFlag";
import { supabaseImageLoader } from "@/lib/supabaseImageLoader";

// Read `mik_country` from document.cookie at call-time. Client-only;
// SSR variant lives at `cookies().get(...)` in the server page.
function readCountryFromCookie(): string {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

type Brand = { name?: string | null; slug?: string | null };
// Vendor disclosure shape — legal_name + gstin + address are required by
// Consumer Protection (E-Commerce) Rules 2020 to be shown on every
// listing for products supplied by a third-party vendor through the
// marketplace. We pull them via a `vendors(...)` join in the product
// fetch below.
type Vendor = {
  display_name?: string | null;
  legal_name?: string | null;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  address_json?: any;
};
type Product = {
  id: string;
  slug: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  compare_at_price?: number | null;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  is_published: boolean;
  brand_id?: string | null;
  category_id?: string | null;
  hero_image_path?: string | null;
  stock_qty?: number | null;
  volume_ml?: number | null;
  net_weight_g?: number | null;
  country_of_origin?: string | null;
  new_until?: string | null;
  is_featured?: boolean | null;
  is_trending?: boolean | null;
  is_bundle?: boolean | null;
  video_path?: string | null;

  // highlight flags
  made_in_korea?: boolean | null;
  is_vegetarian?: boolean | null;
  cruelty_free?: boolean | null;
  toxin_free?: boolean | null;
  paraben_free?: boolean | null;

  // content fields
  ingredients_md?: string | null;
  key_features_md?: string | null;
  additional_details_md?: string | null;
  box_contents_md?: string | null;
  key_benefits?: string[] | null;

  vendor_id?: string | null;
  brands?: Brand | null; // via join
  vendors?: Vendor | null; // via join (only for marketplace items)
};

type ProductImage = {
  storage_path: string;
  alt?: string | null;
  sort_order?: number | null;
};

// Multi-video per product. Loaded from `product_videos`. Sits next to
// the existing `images[]` state; the gallery renders images first,
// then each video as an additional slot.
type ProductVideo = {
  storage_path: string;
  thumbnail_path?: string | null;
  alt?: string | null;
  sort_order?: number | null;
};

/* ---------- Reviews types ---------- */
type Review = {
  id: string;
  product_id: string;
  user_id: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  helpful_count: number;
  is_verified_purchase: boolean;
  status: "published" | "pending" | "hidden";
  created_at: string;
  display_name?: string | null;
  avatar_url?: string | null;
  // ISO-2 country snapshotted at review-create time (backfilled to
  // 'IN' for all pre-feature reviews). Drives the per-country filter
  // and the visitor-country-on-top sort in the reviews tab.
  country?: string | null;
};

type ReviewWithPhotos = Review & { photos?: string[] | null };

type ReviewStats = {
  product_id: string;
  rating_count: number;
  rating_avg: number | null;
  stars_5: number;
  stars_4: number;
  stars_3: number;
  stars_2: number;
  stars_1: number;
};

function storagePublicUrl(
  path?: string | null,
  bucket: "product-media" | "review-media" = "product-media"
) {
  // Backend-aware (Supabase|S3) via the shared resolver, which already
  // tolerantly normalizes legacy full /storage/v1/object/public/ URLs,
  // bucket-prefixed keys, and bare relative keys. Callers expect
  // string | null, so coalesce the resolver's undefined to null.
  return resolveMediaUrl(bucket, path) ?? null;
}

function reviewMediaUrl(path?: string | null) {
  // Review photos always live in the "review-media" bucket. The shared
  // resolver handles the same mixed stored values this used to (full
  // public URLs, "review-media/..."/"product-media/..." prefixes, bare
  // keys). Coalesce undefined -> null to keep the existing return type.
  return resolveMediaUrl("review-media", path) ?? null;
}

function formatINR(value?: number | null, currency?: string | null) {
  if (value == null) return "";
  const code = (currency ?? "INR").toUpperCase();
  if (code === "INR") return `₹${value.toLocaleString("en-IN")}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}

function isWithinWindow(now: Date, start?: string | null, end?: string | null) {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (s && isNaN(s.getTime())) return false;
  if (e && isNaN(e.getTime())) return false;
  if (s && now < s) return false;
  if (e && now > e) return false;
  return true;
}

/* ------------ FAQ (pipe) parser (kept from earlier) ------------ */
type FAQ = { q: string; a: string };
function parseInlineFaqs(raw?: string | null): FAQ[] {
  if (!raw) return [];
  const text = raw.replace(/\n+/g, " ").trim();
  return text
    .split("||")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const qMatch = chunk.match(/Q:\s*(.*?)\s*\|/i);
      const aMatch = chunk.match(/\|\s*A:\s*(.*)$/i);
      return qMatch && aMatch
        ? { q: qMatch[1].trim(), a: aMatch[1].trim() }
        : null;
    })
    .filter((x): x is FAQ => !!x);
}

function randomKey() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function maskEmail(email?: string | null) {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  const masked =
    user.length <= 2
      ? user[0] + "*"
      : user[0] + "*".repeat(user.length - 2) + user.slice(-1);
  return `${masked}@${domain}`;
}

async function currentUserDisplay() {
  // Backend-aware: read the profile from the API (server resolves the user from
  // the session). No browser supabase.auth (fails under NextAuth).
  try {
    const res = await fetch("/api/me/profile", { credentials: "include", cache: "no-store" });
    const j = res.ok ? await res.json() : {};
    const full = j?.profile?.full_name as string | undefined;
    const avatar = j?.profile?.avatar_url as string | undefined;
    return {
      // Snapshot stored to DB — keep stable English label (data, not UI).
      display_name: full?.trim() || "Verified Buyer",
      avatar_url: avatar || null,
    };
  } catch {
    return { display_name: "Verified Buyer", avatar_url: null };
  }
}


function ProductInfoAccordionSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-neutral-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-6 text-left uppercase tracking-[0.22em] text-[13px] text-neutral-900"
      >
        <span>{title}</span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-neutral-600" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-600" />
        )}
      </button>
      {isOpen && <div className="pb-8 text-[15px] leading-7 text-neutral-700">{children}</div>}
    </div>
  );
}

type ProductPageProps = {
  initialProduct?: Product | null;
  initialImages?: ProductImage[];
  initialStoryBlocks?: StoryBlock[];
};

export default function ProductPage({
  initialProduct = null,
  initialImages,
  initialStoryBlocks,
}: ProductPageProps = {}) {
  const router = useRouter();
  const params = useParams();
  const t = useTranslations("pdp");
  const locale = useLocale();
  const slug = (params?.slug as string) || (params?.handle as string);
  const {
    addItem,
    setQty: setCartQty,
    removeItem: removeCartLine,
    items: cartItems,
  } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { formatPrice, isINR } = useCurrency();
  const [showShare, setShowShare] = useState(false);
  const [isBuyingNow, setIsBuyingNow] = useState(false);

  // Initialize from the server-rendered product so the client doesn't
  // need to refetch what SSR already hydrated. If for any reason the
  // server prop is missing (legacy callers, edge case), the useEffect
  // below falls back to fetching client-side.
  const [loading, setLoading] = useState(initialProduct == null);
  const [product, setProduct] = useState<Product | null>(initialProduct);
  // Initialize gallery from the server prop so the browser parses
  // `<img>` tags for every gallery image during HTML hydration and
  // starts fetching them in parallel with the hero — instead of
  // waiting for the bootstrap effect's DB round trip to populate
  // them. Without this, gallery images don't even START loading
  // until ~500-800ms after first paint.
  const [images, setImages] = useState<ProductImage[]>(initialImages ?? []);
  // Multiple videos per product. Loaded alongside images from
  // `product_videos`. The legacy single video on `products.video_path`
  // is still rendered as a fallback when this list is empty so old
  // products keep working through the transition.
  const [videos, setVideos] = useState<ProductVideo[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [pincode, setPincode] = useState("");
  const [deliveryEstimate, setDeliveryEstimate] = useState("");
  const [isCheckingPincode, setIsCheckingPincode] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const shippingConfig = useShippingConfig();

  const [editingReview, setEditingReview] = useState<ReviewWithPhotos | null>(
    null
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [myReview, setMyReview] = useState<ReviewWithPhotos | null>(null);
  // UI toggle for highlights
  const [showHighlights, setShowHighlights] = useState(true);

  // ---- Auth (for reviews) — backend-aware via the auth context (Supabase or
  // NextAuth). Replaces the browser supabase.auth.getUser path that fails post-flip.
  const { user: authUser, isAdmin: authIsAdmin } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    setUserId(authUser?.id ?? null);
    setIsAdmin(!!authIsAdmin);
  }, [authUser?.id, authIsAdmin]);

  const shareUrl = useMemo(
    () => (typeof window !== "undefined" ? window.location.href : ""),
    [slug]
  );
  const shareTitle = product?.name ?? t("defaultShareTitle");
  const shareText =
    product?.short_description ??
    "Found this on K-beauty store — thought you might like it!";
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(`${shareTitle} — ${shareText}`);

  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    email: `mailto:?subject=${encodeURIComponent(
      shareTitle
    )}&body=${encodedText}%0A${encodedUrl}`,
  };

  async function handleShareClick() {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // user canceled or not supported -> fall through to dialog
      }
    }
    setShowShare(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t("linkCopiedToast"));
    } catch {
      toast.error(t("linkCopyFailedToast"));
    }
  }

  // Load images + videos + vendor disclosure. The product itself is
  // hydrated from the `initialProduct` server prop (see ProductPageProps)
  // so this effect does NOT refetch it — that was the biggest single
  // round-trip on the PDP and just duplicated the server's cached fetch.
  //
  // Fallback: if `initialProduct` is null (shouldn't happen via the live
  // page route, but a legacy or test caller might mount this component
  // without it), fetch the product client-side as before.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      // ── Step 1: resolve the product. Server-hydrated path is the
      // common case; the client fetch is the safety net.
      let prod: Product = product as Product;
      if (!prod) {
        setLoading(true);
        const { data: fetched, error: pErr } = await supabase
          .from("products")
          .select(
            `
            id, slug, name, short_description, description,
            price, currency, compare_at_price, sale_price, sale_starts_at, sale_ends_at,
            is_published, brand_id, category_id, hero_image_path, stock_qty,
            volume_ml, net_weight_g, country_of_origin, new_until, is_featured, is_trending, is_bundle,
            made_in_korea, is_vegetarian, cruelty_free, toxin_free, paraben_free,
            ingredients_md, key_features_md, additional_details_md, box_contents_md, key_benefits,
            video_path, vendor_id,
            brands ( name, slug ),
            product_translations!left ( locale, short_description, description, ingredients_md, additional_details_md, key_features_md, box_contents_md, faq, key_benefits, additional_details )
          `
          )
          .eq("slug", slug)
          .eq("is_published", true)
          .maybeSingle<Product>();

        if (cancelled) return;
        if (pErr || !fetched) {
          console.error("Product fetch error:", pErr);
          setLoading(false);
          setProduct(null);
          return;
        }
        const merged = mergeTranslation(
          fetched as any,
          locale,
          PRODUCT_TRANSLATABLE_FIELDS,
          "product_translations"
        );
        Object.assign(fetched, merged);
        prod = fetched;
      }

      // ── Step 2: fetch every other piece of PDP data in a single
      // parallel fan-out. Pre-Phase-1 these lived in 4 separate
      // useEffects that each waited for `product` to be set — i.e.
      // sequential round trips. Now they all fire as soon as we have
      // a product id (which we do immediately from the server prop),
      // so the PDP becomes fully populated in one round-trip wall
      // time instead of several.
      //
      //   • images                     ← skipped when initialImages is set
      //   • videos                     ← per-product
      //   • vendor disclosure          ← conditional on vendor_id
      //   • country offer              ← visitor country
      //   • related products + offers  ← brand-matched up to 8
      //   • review stats               ← aggregate row
      //
      // Reviews list + helpful-votes stay in their own effect because
      // they have non-trivial auth + sort + pagination interactions.
      const country = readCountryFromCookie();
      const hasInitialImages = (initialImages ?? []).length > 0;
      const [
        { data: imgs, error: iErr },
        { data: vids, error: vErrV },
        vendorDisclosure,
        countryOffersMap,
        relatedAugmented,
        { data: reviewStatsRow },
      ] = await Promise.all([
        // Skip the images fetch when the server already gave us a
        // populated gallery — saves a round trip on the warm path.
        hasInitialImages
          ? Promise.resolve({ data: initialImages ?? [], error: null as any })
          : supabase
              .from("product_images")
              .select("storage_path, alt, sort_order")
              .eq("product_id", prod.id)
              .order("sort_order", { ascending: true }),
        supabase
          .from("product_videos")
          .select("storage_path, thumbnail_path, alt, sort_order")
          .eq("product_id", prod.id)
          .order("sort_order", { ascending: true }),
        prod.vendor_id
          ? Promise.all([
              supabase
                .from("store_settings")
                .select("marketplace_disclosure_enabled")
                .eq("id", 1)
                .maybeSingle<{ marketplace_disclosure_enabled: boolean }>(),
              supabase
                .from("vendors_public")
                .select(
                  "display_name, legal_name, gstin, email, phone, address_json"
                )
                .eq("id", prod.vendor_id)
                .maybeSingle<Vendor>(),
            ]).then(([{ data: cfg }, { data: v, error: vErr }]) => {
              if (vErr) console.error("Vendor disclosure fetch error:", vErr);
              return cfg?.marketplace_disclosure_enabled ? v ?? null : null;
            })
          : Promise.resolve(null),
        fetchCountryOffers([prod.id], country, supabase),
        (async () => {
          // Related products now come from the API route (MySQL behind the
          // CATALOG_BACKEND flag), so the browser no longer queries Supabase
          // directly for this widget. Country offers are resolved server-side.
          try {
            const qs = new URLSearchParams({ product_id: prod.id });
            if (prod.brand_id) qs.set("brand_id", prod.brand_id);
            const res = await fetch(`/api/catalog/related?${qs.toString()}`);
            const json = await res.json().catch(() => ({}));
            return (json.related ?? []) as Product[];
          } catch {
            return [] as Product[];
          }
        })(),
        supabase
          .from("product_review_stats")
          .select("*")
          .eq("product_id", prod.id)
          .maybeSingle<ReviewStats>(),
      ]);

      if (iErr) console.error("Images fetch error:", iErr);
      if (vErrV) console.error("Videos fetch error:", vErrV);
      if (cancelled) return;

      setProduct({ ...prod, vendors: vendorDisclosure });
      setImages(imgs ?? []);
      setVideos((vids ?? []) as ProductVideo[]);
      setSelectedImage(0);
      setCountryOfferPrice(
        countryOffersMap[prod.id] != null
          ? Number(countryOffersMap[prod.id])
          : null
      );
      setRelated(relatedAugmented as Product[]);
      setReviewStats(reviewStatsRow ?? null);
      setLoading(false);

      try {
        const rv = JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
        const updated = [
          prod.id,
          ...rv.filter((id: string) => id !== prod.id),
        ].slice(0, 10);
        localStorage.setItem("recentlyViewed", JSON.stringify(updated));
      } catch {}

      try {
        const { trackEvent } = await import("@/lib/analytics/track");
        trackEvent("product_view", {
          product_id: prod.id,
          slug: prod.slug,
          name: prod.name,
          price: prod.price,
          sale_price: prod.sale_price ?? null,
          brand: (prod as any)?.brands?.name ?? null,
        });
      } catch {}
    }

    if (slug) run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Country offer price for this product. Fetched in parallel with
  // images/videos/etc inside the main bootstrap effect above — no
  // separate effect needed. State setter is referenced by that effect's
  // closure; the declaration must stay here so the hook order is
  // stable across renders.
  const [countryOfferPrice, setCountryOfferPrice] = useState<number | null>(null);

  // Compute pricing
  const now = useMemo(() => new Date(), []);
  const saleActive =
    product?.sale_price != null
      ? isWithinWindow(
          now,
          product?.sale_starts_at ?? null,
          product?.sale_ends_at ?? null
        )
      : false;

  const effectivePrice = useMemo(
    () => {
      // Country offer wins. Otherwise fall through to legacy
      // sale_price-within-window or list price.
      if (countryOfferPrice != null) return countryOfferPrice;
      return saleActive && product?.sale_price != null
        ? product.sale_price
        : product?.price ?? null;
    },
    [countryOfferPrice, saleActive, product?.sale_price, product?.price]
  );

  const discount = useMemo(() => {
    if (
      product?.compare_at_price &&
      effectivePrice != null &&
      product.compare_at_price > 0
    ) {
      return Math.round(
        ((product.compare_at_price - effectivePrice) /
          product.compare_at_price) *
          100
      );
    }
    return 0;
  }, [product?.compare_at_price, effectivePrice]);

  const imageUrls = useMemo(() => {
    const gallery = images.length
      ? images.map((m) => storagePublicUrl(m.storage_path) || "")
      : product?.hero_image_path
      ? [storagePublicUrl(product.hero_image_path) || ""]
      : [];
    return gallery.filter(Boolean);
  }, [images, product?.hero_image_path]);

  // Build the list of video URLs the gallery surfaces. Prefer the new
  // `product_videos` rows; fall back to the legacy single
  // `products.video_path` only if the table has no rows for this
  // product (so old single-video products keep working).
  const videoUrls = useMemo(() => {
    if (videos.length > 0) {
      return videos
        .map((v) => storagePublicUrl(v.storage_path))
        .filter((u): u is string => !!u);
    }
    const legacy = storagePublicUrl(product?.video_path ?? null);
    return legacy ? [legacy] : [];
  }, [videos, product?.video_path]);

  // First video URL kept for any code that still reads `videoUrl`.
  const videoUrl = videoUrls[0] ?? "";

  const galleryCount = imageUrls.length + videoUrls.length;
  const isVideoSelected =
    selectedImage >= imageUrls.length &&
    selectedImage < imageUrls.length + videoUrls.length;
  // Which video is currently active (0-indexed) when the user has
  // scrubbed into the video portion of the gallery.
  const activeVideoIndex = isVideoSelected
    ? selectedImage - imageUrls.length
    : 0;
  const activeVideoUrl = videoUrls[activeVideoIndex] ?? "";

  // ── Thumbnail strip auto-scroll ─────────────────────────────────────
  // When the active slot changes (via swipe, arrow keys, etc.) we want
  // the matching thumbnail to be visible in the horizontal strip below.
  // Without this, swiping to image 5 leaves the strip still showing
  // images 1–4 highlighted-but-offscreen.
  //
  // IMPORTANT: we do NOT use `element.scrollIntoView()` here.
  // `scrollIntoView` walks up the scroll-ancestor chain and scrolls
  // EVERY container (including the document/window) so the element
  // ends up in view. On smaller laptops the active thumb is just
  // below the viewport fold on first paint, which made the window
  // auto-scroll a few hundred pixels right after the PDP loaded — a
  // jarring "page jumped on me" effect. On large screens the thumb
  // was already in view, so the bug was invisible.
  //
  // Instead we compute the strip's own scrollLeft directly. That
  // moves the thumbs horizontally inside their own container without
  // touching the window.
  const thumbStripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = thumbStripRef.current;
    if (!container) return;
    const active = container.querySelector<HTMLElement>(
      '[data-thumb-active="true"]'
    );
    if (!active) return;

    // Skip if the thumb is already fully visible inside the strip —
    // no scroll needed.
    const activeLeft = active.offsetLeft;
    const activeRight = activeLeft + active.offsetWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    if (activeLeft >= viewLeft && activeRight <= viewRight) return;

    // Center the active thumb in the strip when it's off-screen.
    const targetLeft = Math.max(
      0,
      activeLeft - (container.clientWidth - active.offsetWidth) / 2
    );
    container.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [selectedImage]);

  // ── Mobile swipe between gallery items ──────────────────────────────
  // Tracks the touchstart X/Y so the touchend handler can decide if the
  // gesture was a horizontal swipe (slot change) vs a vertical scroll
  // (let the page do its thing) vs a tap (let the zoom click fire).
  //
  // Swipe spans the full gallery — images AND videos — so a user can
  // flip from the last image to the first video without reaching for
  // the thumbnail strip. Threshold = 50px horizontal AND horizontal
  // must dominate vertical motion (avoids fighting page scroll).
  //
  // We skip when the touch originated inside the <video> element so
  // the native controls (play/pause/scrubber) work normally — the
  // alternative was swallowing scrubber drags and breaking playback.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD = 50;

  const handleGalleryTouchStart = (e: React.TouchEvent) => {
    if (galleryCount < 2) return;
    const target = e.target as HTMLElement | null;
    // When the touch lands inside a <video>, only the bottom strip is
    // reserved for the native controls (play/pause/scrubber/volume).
    // The rest of the video frame is swipeable just like the image
    // tiles. Without this carve-out the user could never swipe OUT
    // of a video slot, which was the previous bug.
    const t = e.touches[0];
    if (target && (target.tagName === "VIDEO" || target.closest("video"))) {
      const video = (target.tagName === "VIDEO"
        ? target
        : target.closest("video")) as HTMLElement;
      const rect = video.getBoundingClientRect();
      // Bottom 60px (or 30% of height — whichever is smaller) ≈ the
      // native control bar across major browsers. Touches there let
      // the browser's scrubber handle the event.
      const controlsReserve = Math.min(60, rect.height * 0.3);
      if (t.clientY > rect.bottom - controlsReserve) {
        return;
      }
    }
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleGalleryTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) < Math.abs(dy)) return; // mostly vertical → scroll
    // dx < 0  ⇒ swiped left  ⇒ NEXT slot
    // dx > 0  ⇒ swiped right ⇒ PREV slot
    setSelectedImage((curr) => {
      const next = dx < 0 ? curr + 1 : curr - 1;
      // Clamp to [0, galleryCount - 1] — covers images + videos.
      return Math.max(0, Math.min(galleryCount - 1, next));
    });
    // Prevent the click-to-zoom from firing on this gesture.
    e.preventDefault();
  };

  const inWishlist = product ? isInWishlist(product.id) : false;
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const isOutOfStock = (product?.stock_qty ?? 0) <= 0;

  // Upper bound for the quantity selector: cap at stock_qty. Falls back
  // to 99 when stock isn't tracked so the user isn't blocked.
  const maxQty = useMemo(() => {
    const stock = product?.stock_qty ?? null;
    if (stock == null || stock <= 0) return 99;
    return stock;
  }, [product?.stock_qty]);

  // Reset quantity to 1 whenever the visitor switches to a different
  // product (the page is a client component and persists state).
  useEffect(() => {
    setQuantity(1);
  }, [product?.id]);

  // Clamp the current quantity if stock dropped below the selected
  // amount (e.g. another tab updated the cart).
  useEffect(() => {
    setQuantity((q) => Math.min(q, maxQty));
  }, [maxQty]);

  // Cart line for this specific product, if any. Used to mirror the
  // live cart quantity in the selector and to drive the +/- buttons
  // when the item is already in the cart.
  const cartLine = useMemo(
    () =>
      product?.id
        ? cartItems.find((it) => it.product_id === product.id) ?? null
        : null,
    [cartItems, product?.id]
  );
  const inCart = !!cartLine;
  const cartQty = cartLine?.quantity ?? 0;

  // Selector mirrors reality:
  //   - In cart  → live cart quantity (≥ 1).
  //   - Not in cart → 0 (the product hasn't been added yet).
  // Adding starts the count at 1; − at 1 removes the line entirely.
  const displayedQty = inCart ? cartQty : 0;

  const handleAddToCart = async () => {
    if (!product || isAddingToCart || isOutOfStock) return;
    // Once the item is already in the cart, the +/- buttons drive the
    // cart line directly. Tapping "Added to cart" jumps to /cart so
    // the user can review or proceed instead of stacking duplicates.
    if (inCart) {
      router.push("/cart");
      return;
    }
    try {
      setIsAddingToCart(true);
      // First add starts the count at 1. The +/- buttons let the user
      // bump it from there.
      await addItem(product.id, 1);
      toast.success(t("addToCartToast"), {
        description: `${product.name} added to your cart.`,
      });
    } catch (error) {
      console.error("Add to cart error:", error);
      toast.error(t("addToCartError"));
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product || isBuyingNow || isOutOfStock) return;

    // Single Buy Now path for all visitors. /checkout calls
    // /api/razorpay/create which handles INR and the supported
    // international currencies (USD/EUR/GBP/PLN/VND/...) uniformly.
    // The legacy `InternationalOrderModal` "request a quote" flow is
    // dormant — see ISSUE_REGISTER for the deprecation note.
    try {
      setIsBuyingNow(true);
      // If the item is already in the cart, don't add more — the
      // cart line is the source of truth. Otherwise add a single unit
      // (the user can still adjust quantity on /checkout if needed).
      if (!inCart) {
        await addItem(product.id, 1);
      }
      router.push("/checkout");
    } catch (error) {
      console.error("Buy now error:", error);
      toast.error(t("buyNowError"));
    } finally {
      setIsBuyingNow(false);
    }
  };

  const handleWishlistToggle = () => {
    if (!product) return;
    toggleWishlist(product.id);
    toast.success(inWishlist ? t("removedFromWishlistToast") : t("addedToWishlistToast"));
  };

  const checkDelivery = async () => {
    const cleaned = pincode.trim().replace(/[^0-9]/g, "");
    if (cleaned.length !== 6) {
      toast.error(t("invalidPincodeToast"));
      return;
    }
    setIsCheckingPincode(true);
    try {
      const res = await fetch(
        `/api/dtdc/serviceability?pincode=${encodeURIComponent(cleaned)}`,
        { cache: "no-store" }
      );
      const j: {
        ok?: boolean;
        known?: boolean;
        serviceable?: boolean | null;
        placeName?: string;
        state?: string;
        estimatedMaxDeliveryDate?: string;
      } = await res.json().catch(() => ({} as any));

      if (!res.ok || !j?.ok) {
        setDeliveryEstimate("Delivery availability will be confirmed at checkout.");
        return;
      }

      if (j.known === false) {
        setDeliveryEstimate(
          `We don't have delivery info for ${cleaned} yet. Email info@madenkorea.com and we'll confirm.`
        );
        return;
      }

      // Format YYYY-MM-DD as "10 May" (no year — same calendar year either way for ETAs ≤15d).
      const formatBy = (iso?: string) => {
        if (!iso) return null;
        const d = new Date(`${iso}T00:00:00`);
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      };

      const by = formatBy(j.estimatedMaxDeliveryDate);
      const where = [j.placeName, j.state].filter(Boolean).join(", ");

      if (where && by) {
        setDeliveryEstimate(`✓ Deliverable to ${where} by ${by}.`);
      } else if (by) {
        setDeliveryEstimate(`✓ Deliverable to ${cleaned} by ${by}.`);
      } else {
        setDeliveryEstimate(`✓ Deliverable to ${cleaned}.`);
      }
    } catch (e) {
      setDeliveryEstimate("Delivery availability will be confirmed at checkout.");
    } finally {
      setIsCheckingPincode(false);
    }
  };

  // Related products list. Populated by the main bootstrap effect
  // above (brand-matched, country-aware, up to 8). State setter stays
  // declared at this position so the hook order remains stable.
  const [related, setRelated] = useState<Product[]>([]);

  // Build highlight pills
  const highlightItems = useMemo(() => {
    if (!product) return [];
    const items: Array<{
      key: string;
      label: string;
      Icon: React.ComponentType<any>;
    }> = [];
    if (product.made_in_korea)
      items.push({ key: "mik", label: t("featureMadeInKorea"), Icon: Plane });
    if (product.is_vegetarian)
      items.push({ key: "veg", label: t("featureVegetarian"), Icon: Leaf });
    if (product.cruelty_free)
      items.push({
        key: "cruelty",
        label: t("featureCrueltyFree"),
        Icon: HeartHandshake,
      });
    if (product.toxin_free)
      items.push({ key: "toxin", label: t("featureToxinFree"), Icon: ShieldCheck });
    if (product.paraben_free)
      items.push({ key: "paraben", label: t("featureParabenFree"), Icon: CircleSlash });
    return items;
    // Include `t` so the labels recompute if the translator bundle
    // ever changes within the page's lifetime (e.g. HMR).
  }, [product, t]);

  // Helper: render markdown safely
  // Helper: render markdown safely
  const Markdown = ({ children }: { children: string }) => (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ul: ({ node, ...props }) => (
            <ul className="list-disc ml-4 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal ml-4 space-y-1" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );

  /* ---------------- Reviews: fetch stats + list ---------------- */
  const pageSize = 10;
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewSort, setReviewSort] = useState<
    "helpful" | "recent" | "high" | "low"
  >("helpful");
  // Country filter for the reviews tab. "" = no filter (default;
  // visitor's country still bubbles to the top within the chosen
  // sort). Any other value = strict filter to that country only.
  const [reviewCountryFilter, setReviewCountryFilter] = useState<string>("");
  // List of countries that actually have reviews for this product.
  // Populated alongside the reviews fetch so the dropdown only shows
  // options that produce results.
  const [reviewCountries, setReviewCountries] = useState<string[]>([]);
  // Filter-aware count of total reviews matching the current
  // (product + status + country) selection. Drives the "Load more"
  // visibility — `reviewStats.rating_count` is the unfiltered total
  // and would leave the button visible after the filtered set is
  // exhausted.
  const [filteredReviewCount, setFilteredReviewCount] = useState(0);
  const [reviewPage, setReviewPage] = useState(1);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [helpfulVoted, setHelpfulVoted] = useState<Record<string, boolean>>({});
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // Review STATS are loaded by the main bootstrap effect alongside the
  // product/images/videos. The reviews LIST + helpful_votes stay in
  // their own effect below because they have auth + sort + pagination
  // interactions that the bootstrap shouldn't take on.

  async function fetchReviews(resetPage = false, explicitPage?: number) {
    if (!product?.id) return;
    setLoadingReviews(true);
    // `reviewPage` from the closure is the value at the LAST render,
    // not the value after a queued setReviewPage(...) call. The
    // "Load more" handler used to call `setReviewPage(p => p + 1)`
    // and then `fetchReviews(false)` back-to-back — but the read of
    // `reviewPage` here was stale, so every click fetched page 1
    // again. Callers now pass the next page explicitly via
    // `explicitPage` to break the race.
    const page = resetPage ? 1 : (explicitPage ?? reviewPage);

    // Review list + (on the first page) the country filter list & total count
    // come from the server route (MySQL behind the flag, Supabase fallback).
    // The visitor-country two-bucket pagination is handled server-side.
    const qs = new URLSearchParams({
      product_id: product.id,
      sort: reviewSort,
      page: String(page),
      page_size: String(pageSize),
    });
    if (reviewCountryFilter) qs.set("country", reviewCountryFilter);
    if (resetPage) qs.set("first", "1");

    let newRows: Review[] = [];
    {
      const res = await fetch(`/api/catalog/reviews?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({} as any));
      newRows = (json.reviews ?? []) as Review[];
      if (resetPage) {
        setReviewCountries((json.countries ?? []) as string[]);
        setFilteredReviewCount(json.count ?? 0);
      }
    }

    let merged = resetPage ? newRows : [...reviews, ...newRows];
    // Defensive de-dup by id. Protects against race conditions where
    // two near-simultaneous "Load more" clicks or a stale page index
    // could otherwise inject the same review twice into the list.
    {
      const seen = new Set<string>();
      merged = merged.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    }

    setReviews(merged);
    setReviewPage(page);

    // Fetch which of THIS BATCH's reviews the user voted helpful.
    // We use `newRows` (just the batch we just fetched) instead of
    // the merged list because votes for older batches were already
    // resolved in their own fetch call.
    if (userId && newRows.length > 0) {
      const ids = newRows.map((r) => r.id);
      const vRes = await fetch(`/api/reviews/votes?review_ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
      const vJson = await vRes.json().catch(() => ({} as any));
      const map: Record<string, boolean> = {
        ...(resetPage ? {} : helpfulVoted),
        ...(vJson.votes ?? {}),
      };
      setHelpfulVoted(map);
    }
    if (userId) {
      // "My review" can be in any batch; check the merged list so a
      // user whose review landed in a later page still sees the edit
      // affordance on subsequent loads.
      const mine = merged.find((r) => r.user_id === userId) as
        | ReviewWithPhotos
        | undefined;
      setMyReview(mine ?? null);
    }
    setLoadingReviews(false);
  }

  useEffect(() => {
    fetchReviews(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, reviewSort, reviewCountryFilter]);

  /* ---------------- Reviews: actions ---------------- */
  const requireLogin = () => {
    toast.info(t("loginToContinueToast"));
    router.push(`/auth/login?next=/products/${slug}`);
  };

  const openWriteReview = () => {
    if (!userId) return requireLogin();
    setEditingReview(null);
    setShowReviewDialog(true);
  };

  async function submitReview(form: {
    rating: number;
    title: string;
    body: string;
    photos: string[];
  }) {
    if (!userId) return requireLogin();
    if (!product?.id) return;

    // NEW: get snapshot name/avatar
    const who = await currentUserDisplay();

    if (editingReview) {
      const res = await fetch(`/api/reviews/${editingReview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: form.rating,
          title: form.title || null,
          body: form.body || null,
          photos: form.photos ?? [],
          display_name: who.display_name,
          avatar_url: who.avatar_url,
        }),
      });
      if (!res.ok) {
        toast.error(t("reviewUpdateFailToast"));
        return;
      }
      toast.success(t("reviewUpdatedToast"));
    } else {
      const res = await fetch("/api/reviews/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.id,
          rating: form.rating,
          title: form.title || null,
          body: form.body || null,
          photos: form.photos ?? [],
          display_name: who.display_name,
          avatar_url: who.avatar_url,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        // Non-purchasers can now review, so PURCHASE_REQUIRED no longer
        // fires from the API. ALREADY_REVIEWED still does — one review
        // per user per product is enforced by the DB unique index.
        if (payload?.error === "ALREADY_REVIEWED")
          toast.error(t("reviewAlreadyToast"));
        else toast.error(t("reviewSubmitFailToast"));
        return;
      }
      toast.success(t("reviewSubmittedToast"));
    }

    setShowReviewDialog(false);
    setEditingReview(null);
    setReviewPage(1);
    await Promise.all([
      supabase
        .from("product_review_stats")
        .select("*")
        .eq("product_id", product.id)
        .maybeSingle<ReviewStats>()
        .then(({ data }) => setReviewStats(data ?? null)),
      fetchReviews(true),
    ]);
  }

  async function deleteReview(id: string) {
    if (!userId) return requireLogin();
    if (!window.confirm(t("reviewDeleteConfirm"))) return;
    const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(t("reviewDeleteFailToast"));
      return;
    }
    toast.success(t("reviewDeletedToast"));
    setMyReview(null);
    setEditingReview(null);
    fetchReviews(true);
  }

  async function adminSetStatus(id: string, status: "published" | "hidden") {
    if (!isAdmin) return;
    const res = await fetch(`/api/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_status", status }),
    });
    if (!res.ok) {
      toast.error(t("reviewModUpdateFailToast"));
      return;
    }
    toast.success(status === "hidden" ? t("reviewHiddenToast") : t("reviewPublishedToast"));
    fetchReviews(true);
  }

  async function voteHelpful(reviewId: string, isHelpful = true) {
    if (!userId) return requireLogin();
    await fetch(`/api/reviews/${reviewId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_helpful: isHelpful }),
    });
    // update helpful count locally
    setReviews((prev) =>
      prev.map((r) =>
        r.id === reviewId
          ? {
              ...r,
              helpful_count: isHelpful
                ? r.helpful_count + (helpfulVoted[reviewId] ? 0 : 1)
                : r.helpful_count,
            }
          : r
      )
    );
    setHelpfulVoted((m) => ({ ...m, [reviewId]: true }));
  }

  /* ------------ Dynamic tabs (now includes Reviews) ------------ */
  const hasDescription = Boolean(product?.description?.trim());
  const hasBoxContents = Boolean(product?.box_contents_md?.trim());
  const hasIngredients = Boolean(product?.ingredients_md?.trim());
  const hasBenefits =
    Boolean(product?.key_features_md?.trim()) ||
    Boolean(product?.key_benefits && product.key_benefits.length > 0);
  const hasAdditional = Boolean(product?.additional_details_md?.trim());
  const parsedFaqs = useMemo<FAQ[]>(() => {
    const candidates = [
      product?.additional_details_md,
      product?.key_features_md,
      product?.description,
    ];
    for (const c of candidates) {
      const parsed = parseInlineFaqs(c);
      if (parsed.length) return parsed;
    }
    return [];
  }, [
    product?.additional_details_md,
    product?.key_features_md,
    product?.description,
  ]);
  const hasFaq = parsedFaqs.length > 0;

  const tabs = useMemo(
    () =>
      [
        hasDescription && { key: "description", label: t("tabDescription") },
        hasBoxContents && { key: "box-contents", label: t("tabBoxContents") },
        hasIngredients && { key: "ingredients", label: t("tabIngredients") },
        hasBenefits && { key: "benefits", label: t("tabBenefits") },
        hasFaq && { key: "faq", label: "FAQ" },
        hasAdditional && { key: "additional", label: t("tabInformations") },
        // Reviews tab always present (let users write one even if none yet)
        {
          key: "reviews",
          label: `${t("tabReviews")}${
            reviewStats?.rating_count ? ` (${reviewStats.rating_count})` : ""
          }`,
        },
      ].filter(Boolean) as { key: string; label: string }[],
    [
      hasIngredients,
      hasBenefits,
      hasFaq,
      hasAdditional,
      hasDescription,
      hasBoxContents,
      reviewStats?.rating_count,
    ]
  );

  const firstTabValue = tabs[0]?.key ?? "reviews";
  const [openSection, setOpenSection] = useState<string>(firstTabValue);

  useEffect(() => {
    setOpenSection(firstTabValue);
  }, [firstTabValue]);

  function toggleSection(section: string) {
    setOpenSection((current) => (current === section ? "" : section));
  }

  // star helpers
  const StarRow = ({ value }: { value: number }) => (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i <= value
              ? "fill-yellow-400 text-yellow-500"
              : "text-muted-foreground"
          }`}
        />
      ))}
    </div>
  );

  const DistributionRow = ({
    stars,
    count,
    total,
  }: {
    stars: number;
    count: number;
    total: number;
  }) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="w-12">{stars} star</span>
        <div className="flex-1 h-2 bg-muted rounded">
          <div
            className="h-2 rounded bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-10 text-right text-muted-foreground">{pct}%</span>
      </div>
    );
  };

  // ---- Mobile tabs scrolling helpers ----
  const [tabValue, setTabValue] = useState<string>(firstTabValue);
  useEffect(() => setTabValue(firstTabValue), [firstTabValue]);

  const tabsStripRef = useRef<HTMLDivElement>(null);
  const tabBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function scrollTabs(dx: number) {
    const el = tabsStripRef.current;
    if (!el) return;
    el.scrollBy({ left: dx, behavior: "smooth" });
  }

  // When a tab is chosen, center it in the tabs strip. Manual
  // scrollLeft to avoid `scrollIntoView` walking up to the window
  // (same reason as the thumb strip effect above).
  function onChangeTab(v: string) {
    setTabValue(v);
    const el = tabBtnRefs.current[v];
    const strip = tabsStripRef.current;
    if (!el || !strip) return;

    const elLeft = el.offsetLeft;
    const elRight = elLeft + el.offsetWidth;
    const viewLeft = strip.scrollLeft;
    const viewRight = viewLeft + strip.clientWidth;
    if (elLeft >= viewLeft && elRight <= viewRight) return;

    const targetLeft = Math.max(
      0,
      elLeft - (strip.clientWidth - el.offsetWidth) / 2
    );
    strip.scrollTo({ left: targetLeft, behavior: "smooth" });
  }

  return (
    <CustomerLayout>
      {/* `pb-24 md:pb-0` keeps the last visible row from being hidden
          behind the sticky MobileBuyBar on mobile. Desktop has no
          sticky bar, so no extra padding needed. */}
      <div className="container mx-auto py-8 pb-24 md:pb-8">
        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            <div className="aspect-square rounded-lg bg-muted animate-pulse" />
            <div className="space-y-4">
              <div className="h-6 w-40 bg-muted rounded animate-pulse" />
              <div className="h-10 w-3/4 bg-muted rounded animate-pulse" />
              <div className="h-8 w-1/3 bg-muted rounded animate-pulse" />
              <div className="h-24 w-full bg-muted rounded animate-pulse" />
            </div>
          </div>
        )}

        {!loading && !product && (
          <Card className="mx-auto max-w-xl">
            <CardContent className="py-12 text-center space-y-4">
              <h2 className="text-2xl font-semibold">{t("notFound")}</h2>
              <p className="text-muted-foreground">
                This product may be unavailable, moved, or unpublished.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" onClick={() => router.back()}>
                  Go Back
                </Button>
                <Button asChild>
                  <a href="/products">{t("continueShopping")}</a>
                </Button>
                <Button asChild variant="outline">
                  <a href="/">{t("backToHome")}</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && product && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
              {/* GALLERY */}
              <div>
                <div
                  className={`relative aspect-square mb-4 rounded-lg overflow-hidden group touch-pan-y select-none mx-auto max-h-[calc(100vh-280px)] max-w-[calc(100vh-280px)] ${
                    !isVideoSelected ? "cursor-zoom-in" : ""
                  }`}
                  onClick={() => {
                    if (!isVideoSelected) setShowZoom(true);
                  }}
                  onTouchStart={handleGalleryTouchStart}
                  onTouchEnd={handleGalleryTouchEnd}
                  role={!isVideoSelected ? "button" : undefined}
                  tabIndex={!isVideoSelected ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (
                      !isVideoSelected &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      setShowZoom(true);
                    }
                  }}
                  aria-label={
                    !isVideoSelected ? t("expandImageAria") : undefined
                  }
                >
                  {/* Skeleton/pulse layer behind everything. Visible
                      while the image hasn't loaded yet; gets covered
                      by the rendered <Image> once decoded. Kept as a
                      SEPARATE sibling rather than as a class on the
                      outer container so the pulse animation doesn't
                      bleed into the loaded image's opacity. */}
                  <div
                    className="absolute inset-0 bg-muted animate-pulse"
                    aria-hidden="true"
                  />

                  {isVideoSelected && activeVideoUrl ? (
                    <video
                      key={activeVideoUrl} /* force refresh when switching */
                      src={activeVideoUrl}
                      controls
                      autoPlay
                      playsInline
                      // `object-contain` + bg-black preserves the
                      // video's native aspect ratio. Most product
                      // videos are vertical (9:16 phone shots); the
                      // earlier `object-cover` was cropping them to
                      // fit the square gallery, which is what the
                      // user called "orientation not preserved." With
                      // `contain`, portrait videos render fully inside
                      // the square with vertical black letterboxes
                      // on either side, and landscape videos render
                      // fully with top/bottom letterboxes.
                      className="relative w-full h-full object-contain bg-black"
                    />
                  ) : imageUrls.length > 0 ? (
                    // Stack ALL gallery images in the same container,
                    // toggle visibility via opacity. Browser loads every
                    // variant up front (same network cost as preloading
                    // hidden Images, but layered guarantees the visible
                    // swap is a CSS opacity flip — instant and smooth.
                    //
                    // Only the index-0 image carries `priority` so we
                    // don't blow the LCP budget on every gallery item.
                    //
                    // `key` is the index (not the URL) so React reuses
                    // the same DOM node across product navigations.
                    // Using src as the key caused a brief "no image
                    // visible" flash when navigating between products
                    // that happened to share an image URL, because
                    // selectedImage from the previous product became
                    // stale relative to the new index order.
                    imageUrls.map((src, idx) => (
                      <Image
                        key={idx}
                        src={src}
                        alt={images[idx]?.alt || product.name}
                        fill
                        className={`object-cover transition-opacity duration-200 ${
                          selectedImage === idx
                            ? "opacity-100"
                            : "opacity-0 pointer-events-none"
                        }`}
                        priority={idx === 0}
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        loader={supabaseImageLoader}
                      />
                    ))
                  ) : null}

                  {discount > 0 && (
                    <Badge
                      className="absolute top-4 left-4"
                      variant="destructive"
                    >
                      {discount}% OFF
                    </Badge>
                  )}

                  {/* Visual hint that the image expands. The whole image
                      is the click target — this badge is just affordance. */}
                  {!isVideoSelected && (
                    <div
                      className="absolute top-4 right-4 rounded-md bg-background/90 p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      aria-hidden="true"
                    >
                      <Maximize2 className="h-5 w-5" />
                    </div>
                  )}
                </div>

                {galleryCount > 1 && (
                  // Single-row scrollable thumbnail strip. Replaces the
                  // previous `grid grid-cols-4` which wrapped to a
                  // second row at 5+ items. A subtle right-edge fade
                  // hints there's more to scroll.
                  <div className="relative">
                    <div
                      ref={thumbStripRef}
                      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30"
                    >
                      {/* image thumbs. `bg-muted` shows a gray slot
                          while the thumb image is still decoding so
                          the carousel doesn't look like it has empty
                          gaps. */}
                      {imageUrls.map((src, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedImage(idx)}
                          data-thumb-active={selectedImage === idx}
                          className={`relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 bg-muted ${
                            selectedImage === idx
                              ? "border-primary"
                              : "border-transparent"
                          }`}
                        >
                          <Image
                            src={src}
                            alt={`${product.name} ${idx + 1}`}
                            fill
                            className="object-cover"
                            sizes="80px"
                            loader={supabaseImageLoader}
                          />
                        </button>
                      ))}

                      {/* video thumbs (one per video). Selecting slot
                          index = imageUrls.length + i jumps the active
                          gallery item to the i-th video. */}
                      {videoUrls.map((src, i) => {
                        const slotIndex = imageUrls.length + i;
                        const active = selectedImage === slotIndex;
                        return (
                          <button
                            key={`video-${src}`}
                            onClick={() => setSelectedImage(slotIndex)}
                            data-thumb-active={active}
                            className={`relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 ${
                              active ? "border-primary" : "border-transparent"
                            }`}
                            aria-label={t("productVideoAria")}
                            title={t("productVideoAria")}
                          >
                            <video
                              src={src}
                              muted
                              playsInline
                              preload="metadata"
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/30 grid place-items-center">
                              <PlayCircle className="h-8 w-8 text-white drop-shadow" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {galleryCount > 4 && (
                      <div
                        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* DETAILS */}
              <div className="space-y-6">
                {product.brands?.name && (
                  <p className="text-sm text-muted-foreground uppercase tracking-wide">
                    {product.brands.name}
                  </p>
                )}

                <h1 className="text-3xl font-bold">{product.name}</h1>

                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold">
                    {effectivePrice != null ? formatPrice(effectivePrice) : ""}
                  </span>
                  {product.compare_at_price != null &&
                    effectivePrice != null &&
                    product.compare_at_price > effectivePrice && (
                      <span className="text-xl text-muted-foreground line-through">
                        {formatPrice(product.compare_at_price)}
                      </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {saleActive && product.sale_ends_at && (
                    <Badge variant="outline" className="text-orange-600">
                      Sale ends{" "}
                      {new Date(product.sale_ends_at).toLocaleDateString(
                        "en-IN",
                        {
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </Badge>
                  )}
                  {product.is_bundle && (
                    <Badge variant="default">{t("badgeBundle")}</Badge>
                  )}
                  {product.new_until && new Date(product.new_until) >= now && (
                    <Badge variant="default">{t("badgeNew")}</Badge>
                  )}
                  {product.is_featured && (
                    <Badge variant="default">{t("badgeFeatured")}</Badge>
                  )}
                  {product.is_trending && (
                    <Badge variant="default">{t("badgeTrending")}</Badge>
                  )}
                </div>

                {/* HIGHLIGHTS (toggle) */}
                {highlightItems.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowHighlights((v) => !v)}
                      className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      {t("productHighlights")}
                      {showHighlights ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {showHighlights && (
                      <div className="flex flex-wrap gap-2">
                        {highlightItems.map(({ key, label, Icon }) => (
                          <div
                            key={key}
                            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm bg-background border-[#2f5f9f] bg-[#eaf4ff]"
                          >
                            <Icon className="h-4 w-4" />
                            <span>{label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Short description */}
                {product.short_description && (
                  <p className="text-sm text-muted-foreground">
                    {product.short_description}
                  </p>
                )}

                {/* Quantity + CTAs */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {/* 44px touch targets for the +/- buttons (Apple
                      guideline) — the previous size="sm" was 32px,
                      cramped on mobile. Plus and Minus icons replace
                      raw "+" / "-" text for a centered glyph. Both
                      handlers use functional setters and respect the
                      stock-aware max so rapid clicks don't push past
                      available inventory. */}
                  {/* +/- always drive the cart. Decrementing from 1
                      removes the line; incrementing from 0 adds 1.
                      The Add-to-Cart button handles the same first-add
                      action, but is needed because some users expect
                      a labelled CTA. */}
                  <div className="flex items-center border rounded-lg overflow-hidden self-start">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 rounded-none"
                      onClick={() => {
                        if (!cartLine) return;
                        if (cartQty <= 1) {
                          void removeCartLine(cartLine.id);
                        } else {
                          void setCartQty(cartLine.id, cartQty - 1);
                        }
                      }}
                      disabled={!inCart || isOutOfStock}
                      aria-label={
                        cartQty === 1
                          ? t("removeFromCart")
                          : t("decreaseQty")
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="px-4 min-w-[3rem] text-center font-medium tabular-nums">
                      {displayedQty}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 rounded-none"
                      onClick={() => {
                        if (!product || isOutOfStock) return;
                        if (cartLine) {
                          if (cartQty < maxQty) {
                            void setCartQty(cartLine.id, cartQty + 1);
                          }
                        } else {
                          void addItem(product.id, 1);
                        }
                      }}
                      disabled={
                        isOutOfStock ||
                        (inCart && cartQty >= maxQty)
                      }
                      aria-label={
                        inCart ? t("increaseQty") : t("addToCart")
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Desktop-only action buttons. Mobile gets the
                      sticky MobileBuyBar at the bottom of the page —
                      rendering them both would duplicate the same
                      controls. The qty stepper above stays visible on
                      both breakpoints; the bar reads its quantity. */}
                  <div className="hidden md:grid flex-1 gap-3 sm:grid-cols-2">
                    <Button
                      size="lg"
                      className={`w-full transition-colors ${
                        inCart
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : ""
                      }`}
                      onClick={handleAddToCart}
                      disabled={isAddingToCart || isOutOfStock}
                    >
                      {inCart ? (
                        <Check className="mr-2 h-5 w-5" />
                      ) : (
                        <ShoppingCart className="mr-2 h-5 w-5" />
                      )}
                      {isOutOfStock
                        ? t("outOfStock")
                        : isAddingToCart
                        ? t("addingToCart")
                        : inCart
                        ? t("addedToCart")
                        : t("addToCart")}
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full"
                      onClick={handleBuyNow}
                      disabled={isBuyingNow || isOutOfStock}
                    >
                      {isOutOfStock
                        ? t("outOfStock")
                        : isBuyingNow
                        ? t("buyNowProcessing")
                        : t("buyNow")}
                    </Button>
                  </div>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleWishlistToggle}
                    aria-label={inWishlist ? t("removeFromWishlist") : t("addToWishlist")}
                    className="hidden md:inline-flex shrink-0"
                  >
                    <Heart
                      className={`h-5 w-5 ${
                        inWishlist ? "fill-red-500 text-red-500" : ""
                      }`}
                    />
                  </Button>
                </div>

                {/* Share + shipping highlights */}
                <div className="flex items-center gap-4 pt-6 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleShareClick}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    {t("shareBtn")}
                  </Button>
                </div>

                <Card className="mt-6">
                  <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                    {/* Pincode delivery checker is India-only — the
                        DTDC serviceability lookup only covers Indian
                        pincodes. International visitors get a brief
                        note + link to the contact page instead. */}
                    {isINR ? (
                      <>
                        <div>
                          <Label htmlFor="pincode">{t("checkDelivery")}</Label>
                          <div className="flex gap-2 mt-2">
                            <Input
                              id="pincode"
                              placeholder={t("pincodePlaceholder")}
                              autoComplete="postal-code"
                              value={pincode}
                              onChange={(e) =>
                                setPincode(
                                  e.target.value.replace(/\D/g, "").slice(0, 6)
                                )
                              }
                              maxLength={6}
                            />
                            <Button
                              onClick={checkDelivery}
                              disabled={isCheckingPincode}
                            >
                              {isCheckingPincode ? t("checking") : t("checkBtn")}
                            </Button>
                          </div>
                          {deliveryEstimate && (
                            <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                              <Truck className="h-4 w-4" />
                              {deliveryEstimate}
                            </p>
                          )}
                        </div>

                        <Separator />
                      </>
                    ) : (
                      <>
                        <div className="text-sm text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">
                            {t("intlShippingHeading")}
                          </p>
                          <p>{t("intlShippingBody")}</p>
                        </div>
                        <Separator />
                      </>
                    )}

                    <TooltipProvider delayDuration={150}>
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-sm">
                        {[
                          {
                            href: "/policies/shipping-returns#free-shipping",
                            Icon: Truck,
                            title: t("perkFreeShipping"),
                            sub: t("perkFreeShippingSub", { amount: shippingConfig.deliveryThreshold.toLocaleString("en-IN") }),
                            tip: t("perkFreeShippingTip", { amount: shippingConfig.deliveryThreshold.toLocaleString("en-IN") }),
                          },
                          {
                            href: "/policies/shipping-returns#easy-returns",
                            Icon: RotateCcw,
                            title: t("perkEasyReturns"),
                            sub: t("perkEasyReturnsSub"),
                            tip: t("perkEasyReturnsTip"),
                          },
                          {
                            href: "/policies/shipping-returns#secure-payment",
                            Icon: Shield,
                            title: t("perkSecurePayment"),
                            // Word-mark rendered from the official Razorpay SVG in /public.
                            // Sized to sit on the same baseline as the other subtitles.
                            sub: (
                              <span className="inline-flex items-center gap-1">
                                {t("perkSecurePaymentSubPrefix")}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src="/razorpay-logo.svg"
                                  alt="Razorpay"
                                  className="h-3 sm:h-3.5 w-auto inline-block"
                                />
                              </span>
                            ),
                            tip: t("perkSecurePaymentTip"),
                          },
                          {
                            href: "/policies/shipping-returns#authentic-products",
                            Icon: Package,
                            title: t("perkAuthenticProducts"),
                            sub: t("perkAuthenticProductsSub"),
                            tip: t("perkAuthenticProductsTip"),
                          },
                        ].map(({ href, Icon, title, sub, tip }) => (
                          <Tooltip key={title}>
                            <TooltipTrigger asChild>
                              <Link
                                href={href}
                                className="flex flex-col items-center justify-center text-center gap-1 rounded-md p-1.5 sm:p-2 hover:bg-muted/60 transition-colors min-w-0"
                              >
                                <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                                <p className="font-medium leading-tight text-xs sm:text-sm">{title}</p>
                                <p className="text-muted-foreground text-[11px] sm:text-xs leading-snug line-clamp-2">{sub}</p>
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              {tip}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </TooltipProvider>
                  </CardContent>
                </Card>

                {/* ---------- Marketplace seller disclosure ----------
                    Required by Consumer Protection (E-Commerce) Rules
                    2020 for vendor-supplied products: legal name +
                    address + GSTIN visible on every listing. Renders
                    only when the product has a vendor row attached. */}
                {product?.vendor_id && product?.vendors && (
                  <Card className="mt-4">
                    <CardContent className="p-4 text-sm space-y-2">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                        <Package className="h-3.5 w-3.5" />
                        {t("soldByLabel")}
                      </div>
                      <p className="font-medium">
                        {product.vendors.legal_name ||
                          product.vendors.display_name ||
                          t("authorisedSellerFallback")}
                      </p>
                      {(() => {
                        const a = product.vendors?.address_json;
                        if (!a || typeof a !== "object") return null;
                        const parts = [
                          a.line1,
                          a.line2,
                          a.city,
                          a.state,
                          a.pincode || a.postal_code,
                          a.country,
                        ]
                          .filter((x) => typeof x === "string" && x.trim())
                          .join(", ");
                        return parts ? (
                          <p className="text-muted-foreground">{parts}</p>
                        ) : null;
                      })()}
                      {product.vendors.gstin && (
                        <p className="text-muted-foreground">
                          GSTIN:{" "}
                          <span className="font-mono">
                            {product.vendors.gstin}
                          </span>
                        </p>
                      )}
                      {product.vendors.email && (
                        <p className="text-muted-foreground">
                          <a
                            href={`mailto:${product.vendors.email}`}
                            className="hover:underline"
                          >
                            {product.vendors.email}
                          </a>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* ---------- DYNAMIC TABS (auto-hide when empty) ---------- */}

            {tabs.length > 0 && (
              <div className="mt-12 border-t border-neutral-200">
                {hasDescription && (
                  <ProductInfoAccordionSection
                    title={t("tabDescription")}
                    isOpen={openSection === "description"}
                    onToggle={() => toggleSection("description")}
                  >
                    {product?.description && (
                      <Markdown>{product.description}</Markdown>
                    )}
                  </ProductInfoAccordionSection>
                )}

                {hasBoxContents && (
                  <ProductInfoAccordionSection
                    title={t("tabBoxContents")}
                    isOpen={openSection === "box-contents"}
                    onToggle={() => toggleSection("box-contents")}
                  >
                    <Markdown>{product!.box_contents_md!}</Markdown>
                  </ProductInfoAccordionSection>
                )}

                {hasIngredients && (
                  <ProductInfoAccordionSection
                    title={t("tabIngredients")}
                    isOpen={openSection === "ingredients"}
                    onToggle={() => toggleSection("ingredients")}
                  >
                    <Markdown>{product!.ingredients_md!}</Markdown>
                  </ProductInfoAccordionSection>
                )}

                {hasBenefits && (
                  <ProductInfoAccordionSection
                    title={t("tabHowToUse")}
                    isOpen={openSection === "benefits"}
                    onToggle={() => toggleSection("benefits")}
                  >
                    <div className="space-y-4">
                      {product?.key_features_md?.trim() && (
                        <Markdown>{product.key_features_md!}</Markdown>
                      )}
                      {!product?.key_features_md?.trim() &&
                        product?.key_benefits &&
                        product.key_benefits.length > 0 && (
                          <ul className="list-disc pl-5 text-[15px] leading-8">
                            {product.key_benefits.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        )}
                    </div>
                  </ProductInfoAccordionSection>
                )}

                {hasAdditional && (
                  <ProductInfoAccordionSection
                    title={t("tabAdditional")}
                    isOpen={openSection === "additional"}
                    onToggle={() => toggleSection("additional")}
                  >
                    <Markdown>{product!.additional_details_md!}</Markdown>
                  </ProductInfoAccordionSection>
                )}
              </div>
            )}

            {product?.id ? (
              <ProductStorySection
                productId={product.id}
                initialBlocks={initialStoryBlocks}
              />
            ) : null}

            {tabs.length > 0 && (
              <div className="border-t border-neutral-200">
                <ProductInfoAccordionSection
                  title={
                    reviewStats?.rating_count
                      ? t("reviewsHeadingWithCount", { count: reviewStats.rating_count })
                      : t("reviewsHeading")
                  }
                  isOpen={openSection === "reviews"}
                  onToggle={() => toggleSection("reviews")}
                >
                  <div className="space-y-6 pt-2">
                    {/* Summary header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl font-bold">
                          {reviewStats?.rating_avg
                            ? Number(reviewStats.rating_avg).toFixed(1)
                            : "0.0"}
                        </div>
                        <div>
                          <StarRow
                            value={Math.round(reviewStats?.rating_avg || 0)}
                          />
                          <div className="text-sm text-muted-foreground">
                            {t("reviewCountPlural", { count: reviewStats?.rating_count || 0 })}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm text-muted-foreground">
                          {t("reviewsSortLabel")}
                        </label>
                        <select
                          value={reviewSort}
                          onChange={(e) => setReviewSort(e.target.value as any)}
                          className="border rounded-md px-2 py-1 text-sm bg-background"
                        >
                          <option value="helpful">{t("reviewsSortHelpful")}</option>
                          <option value="recent">{t("reviewsSortRecent")}</option>
                          <option value="high">{t("reviewsSortHigh")}</option>
                          <option value="low">{t("reviewsSortLow")}</option>
                        </select>

                        {/* Country filter. Always rendered (was
                            previously gated on 2+ distinct countries
                            existing for the product, which hid the
                            control when the catalog only had reviews
                            from one country — leaving the filter
                            functionality un-discoverable). If the
                            product has reviews from only one country,
                            the dropdown still works; it just has one
                            real option. */}
                        <label className="text-sm text-muted-foreground ml-2">
                          Country
                        </label>
                        <select
                          value={reviewCountryFilter}
                          onChange={(e) =>
                            setReviewCountryFilter(e.target.value)
                          }
                          className="border rounded-md px-2 py-1 text-sm bg-background"
                        >
                          <option value="">All countries</option>
                          {reviewCountries.map((cc) => {
                            const profile = (COUNTRY_PROFILES as any)[cc];
                            // <option> can't host SVGs — name only.
                            return (
                              <option key={cc} value={cc}>
                                {profile?.name ?? cc}
                              </option>
                            );
                          })}
                        </select>
                        {myReview ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingReview(myReview);
                              setShowReviewDialog(true);
                            }}
                          >
                            {t("reviewEditYours")}
                          </Button>
                        ) : (
                          <Button onClick={openWriteReview}>
                            {t("reviewWriteBtn")}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Distribution */}
                    {!!reviewStats && (
                      <div className="grid gap-2 max-w-xl">
                        <DistributionRow
                          stars={5}
                          count={reviewStats.stars_5}
                          total={reviewStats.rating_count}
                        />
                        <DistributionRow
                          stars={4}
                          count={reviewStats.stars_4}
                          total={reviewStats.rating_count}
                        />
                        <DistributionRow
                          stars={3}
                          count={reviewStats.stars_3}
                          total={reviewStats.rating_count}
                        />
                        <DistributionRow
                          stars={2}
                          count={reviewStats.stars_2}
                          total={reviewStats.rating_count}
                        />
                        <DistributionRow
                          stars={1}
                          count={reviewStats.stars_1}
                          total={reviewStats.rating_count}
                        />
                      </div>
                    )}

                    <Separator />

                    {/* Review list */}
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                        {t("reviewsTotalLine", {
                          count: reviewStats?.rating_count || 0,
                          avg: reviewStats?.rating_avg
                            ? Number(reviewStats.rating_avg).toFixed(1)
                            : "0.0",
                        })}
                      </div>
                      {loadingReviews && reviews.length === 0 && (
                        <div className="space-y-3">
                          {Array.from({ length: 3 }).map((_, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border p-4 space-y-3"
                            >
                              <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                              <div className="h-3 w-full rounded bg-muted animate-pulse" />
                              <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
                            </div>
                          ))}
                        </div>
                      )}
                      {reviews.map((r) => (
                        <div key={r.id} className="rounded-xl border p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              {r.avatar_url ? (
                                <div className="relative h-8 w-8 rounded-full overflow-hidden border">
                                  <Image
                                    src={r.avatar_url}
                                    alt={r.display_name ?? t("reviewerFallback")}
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                              ) : null}

                              <div>
                                <StarRow value={r.rating} />
                                <div className="text-sm text-foreground/90 flex items-center gap-1.5 flex-wrap">
                                  <span>
                                    {r.display_name ||
                                      (r.is_verified_purchase
                                        ? t("verifiedBuyer")
                                        : t("anonymousReviewer"))}
                                  </span>
                                  {/* Country flag for the reviewer.
                                      Snapshotted at review-create time
                                      so it never changes if the user
                                      later moves countries. */}
                                  {r.country && (
                                    // Render whatever country code is
                                    // on the row — review data carries
                                    // countries that aren't in our
                                    // storefront's SUPPORTED list
                                    // (notably AU/CA from seed data),
                                    // and the earlier gate of
                                    // `COUNTRY_PROFILES[code] &&` was
                                    // hiding the flag chip entirely
                                    // for those reviews. The
                                    // CountryFlag component itself
                                    // gracefully returns null for any
                                    // code it doesn't have an SVG for.
                                    <span
                                      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                                      title={
                                        (COUNTRY_PROFILES as any)[r.country]
                                          ?.name ?? r.country
                                      }
                                    >
                                      <CountryFlag code={r.country} />
                                      <span className="tabular-nums">
                                        {r.country}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString()}
                            </div>
                          </div>

                          {r.title && (
                            <div className="mt-1 font-medium">{r.title}</div>
                          )}
                          {r.body && (
                            <p className="mt-1 text-sm text-foreground/80 whitespace-pre-line">
                              {r.body}
                            </p>
                          )}
                          {r.photos && r.photos.length > 0 && (
                            <div className="mt-3 flex gap-2 overflow-x-auto">
                              {r.photos.map((p: string, i: number) => {
                                const url = reviewMediaUrl(p);
                                return url ? (
                                  <div
                                    key={i}
                                    className="relative w-24 h-24 rounded overflow-hidden border flex-shrink-0"
                                  >
                                    <Image
                                      src={url}
                                      alt={t("reviewPhotoAlt", { index: i + 1 })}
                                      fill
                                      className="object-cover"
                                    />
                                  </div>
                                ) : null;
                              })}
                            </div>
                          )}

                          <div className="mt-3 flex items-center gap-3">
                            {/* Require a logged-in userId before
                                comparing — otherwise a null userId
                                matches the null `user_id` rows that
                                exist on legacy/guest reviews and
                                falsely exposes Edit/Delete. */}
                            {!!userId && userId === r.user_id && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditingReview(r as ReviewWithPhotos);
                                    setShowReviewDialog(true);
                                  }}
                                >
                                  <Edit3 className="h-4 w-4 mr-2" /> {t("reviewEditBtn")}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteReview(r.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> {t("reviewDeleteBtn")}
                                </Button>
                              </>
                            )}

                            {isAdmin && (
                              <>
                                {r.status === "published" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      adminSetStatus(r.id, "hidden")
                                    }
                                  >
                                    <EyeOff className="h-4 w-4 mr-2" /> {t("reviewHideBtn")}
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      adminSetStatus(r.id, "published")
                                    }
                                  >
                                    <Eye className="h-4 w-4 mr-2" /> {t("reviewPublishBtn")}
                                  </Button>
                                )}
                              </>
                            )}
                          </div>

                          <div className="mt-3 flex items-center gap-3">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => voteHelpful(r.id, true)}
                              className={
                                helpfulVoted[r.id]
                                  ? "border-green-500 text-green-700"
                                  : ""
                              }
                            >
                              <ThumbsUp className="h-4 w-4 mr-2" />
                              {t("reviewHelpfulBtn", { count: r.helpful_count })}
                            </Button>
                            {r.is_verified_purchase && (
                              <Badge variant="secondary" className="text-xs">
                                {t("reviewVerifiedPurchase")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                      {reviews.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          {t("reviewsEmpty")}
                        </p>
                      )}
                    </div>

                    {reviews.length < filteredReviewCount && (
                      <div className="text-center">
                        <Button
                          onClick={() => {
                            const next = reviewPage + 1;
                            setReviewPage(next);
                            // Pass `next` explicitly so the fetch
                            // doesn't read a stale reviewPage from
                            // its closure — see the comment inside
                            // fetchReviews for the full story.
                            fetchReviews(false, next);
                          }}
                          disabled={loadingReviews}
                        >
                          {loadingReviews ? t("loading") : t("loadMore")}
                        </Button>
                      </div>
                    )}
                  </div>
                </ProductInfoAccordionSection>
              </div>
            )}

            {/* RELATED (unchanged) */}
            {related.length > 0 && (
              <div className="mt-12">
                <h2 className="text-2xl font-bold mb-6">{t("relatedProductsHeading")}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {related.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={
                        {
                          ...p,
                          hero_image_path: p.hero_image_path ?? undefined,
                          hero_image_url:
                            storagePublicUrl(p.hero_image_path) ?? undefined,
                          brands: p.brands ?? undefined,
                        } as any
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* LIGHTBOX — proper image viewer with prev/next + keyboard nav */}
      <Dialog open={showZoom} onOpenChange={setShowZoom}>
        <DialogContent
          // Mobile: pin the dialog to all four viewport edges with
          // `inset-0` and zero out the translate. With both `left: 0`
          // and `right: 0` set, the browser computes width to fill the
          // visible viewport precisely — no scrollbar gutter quirk, no
          // off-by-pixel from translate-centering. `w-auto` and
          // `h-auto` defer width/height to the inset offsets.
          //
          // Tablet+: revert to centered `90vmin` square.
          //
          // `overflow-hidden` on the dialog itself contains anything
          // image-specific that might otherwise leak. `!` prefixes win
          // over shadcn's defaults regardless of class merge order.
          className="!fixed !inset-0 !translate-x-0 !translate-y-0 !w-auto !max-w-none !h-auto !max-h-none !rounded-none overflow-hidden sm:!inset-auto sm:!top-[50%] sm:!left-[50%] sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:!w-[90vmin] sm:!max-w-[90vmin] sm:!h-[90vmin] sm:!max-h-[90vmin] sm:!rounded-lg p-0 grid grid-rows-[auto_1fr_auto] gap-0"
          onKeyDown={(e) => {
            if (galleryCount < 2) return;
            // Navigation covers both image and video slots — same
            // unified gallery the swipe handler uses.
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setSelectedImage((i) => (i >= galleryCount - 1 ? 0 : i + 1));
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              setSelectedImage((i) => (i <= 0 ? galleryCount - 1 : i - 1));
            }
          }}
        >
          <DialogHeader className="p-4 pr-12 pb-2 shrink-0 flex flex-row items-center justify-between gap-3 min-w-0 overflow-hidden">
            <DialogTitle className="truncate min-w-0 flex-1">
              {product?.name || t("productImageFallback")}
            </DialogTitle>
            {galleryCount > 1 && (
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {Math.min(selectedImage, galleryCount - 1) + 1} /{" "}
                {galleryCount}
              </span>
            )}
          </DialogHeader>

          {/* Media area — fills the middle row (1fr) of the dialog grid.
              Images render in the existing Image stack; videos render
              with native controls so playback works inside the modal.
              `overflow-hidden` + `max-w-full` clamp any inner content
              so it cannot push the cell wider than the dialog. */}
          <div className="relative min-h-0 min-w-0 max-w-full overflow-hidden">
            {/* Pulse skeleton behind the media. Visible while the zoomed
                image is decoding; covered once the <Image> renders. */}
            <div
              className="absolute inset-0 bg-muted/30 animate-pulse"
              aria-hidden="true"
            />
            {isVideoSelected && activeVideoUrl ? (
              <video
                key={activeVideoUrl}
                src={activeVideoUrl}
                controls
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-contain bg-black"
              />
            ) : imageUrls[selectedImage] ? (
              <Image
                src={imageUrls[selectedImage]}
                alt={product?.name || t("productImageAlt")}
                fill
                className="object-contain select-none"
                sizes="(max-width: 640px) 100vw, 720px"
                draggable={false}
                loader={supabaseImageLoader}
              />
            ) : null}

            {galleryCount > 1 && (
              <>
                <button
                  type="button"
                  aria-label={t("prevImage")}
                  onClick={() =>
                    setSelectedImage((i) =>
                      i <= 0 ? galleryCount - 1 : i - 1
                    )
                  }
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/90 hover:bg-background shadow-md p-2 md:p-3 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5 md:h-6 md:w-6" />
                </button>
                <button
                  type="button"
                  aria-label={t("nextImage")}
                  onClick={() =>
                    setSelectedImage((i) =>
                      i >= galleryCount - 1 ? 0 : i + 1
                    )
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/90 hover:bg-background shadow-md p-2 md:p-3 transition-colors"
                >
                  <ChevronRight className="h-5 w-5 md:h-6 md:w-6" />
                </button>
              </>
            )}
          </div>

          {galleryCount > 1 && (
            <div className="p-3 border-t bg-background flex gap-2 shrink-0 overflow-x-auto">
              {imageUrls.map((src, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImage(idx)}
                  aria-label={`View image ${idx + 1}`}
                  aria-current={selectedImage === idx ? "true" : undefined}
                  className={`relative shrink-0 w-16 h-16 md:w-20 md:h-20 rounded border-2 overflow-hidden transition-colors bg-muted ${
                    selectedImage === idx
                      ? "border-primary"
                      : "border-transparent hover:border-muted-foreground/40"
                  }`}
                >
                  <Image
                    src={src}
                    alt={t("thumbAlt", { index: idx + 1 })}
                    fill
                    className="object-cover"
                    sizes="80px"
                    loader={supabaseImageLoader}
                  />
                </button>
              ))}

              {/* Video thumbs (one per video). Selecting slot index
                  = imageUrls.length + i jumps the lightbox to the
                  i-th video. */}
              {videoUrls.map((src, i) => {
                const slotIndex = imageUrls.length + i;
                const active = selectedImage === slotIndex;
                return (
                  <button
                    key={`video-${src}`}
                    type="button"
                    onClick={() => setSelectedImage(slotIndex)}
                    aria-label={t("productVideoAria")}
                    aria-current={active ? "true" : undefined}
                    className={`relative shrink-0 w-16 h-16 md:w-20 md:h-20 rounded border-2 overflow-hidden transition-colors ${
                      active
                        ? "border-primary"
                        : "border-transparent hover:border-muted-foreground/40"
                    }`}
                  >
                    <video
                      src={src}
                      muted
                      playsInline
                      preload="metadata"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 grid place-items-center">
                      <PlayCircle className="h-6 w-6 text-white drop-shadow" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showShare} onOpenChange={setShowShare}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("shareThisProduct")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Button asChild variant="outline">
                <a
                  href={shareLinks.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4 mr-2" /> {t("shareLabelWhatsApp")}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={shareLinks.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4 mr-2" /> {t("shareLabelTelegram")}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={shareLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4 mr-2" /> {t("shareLabelTwitter")}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={shareLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4 mr-2" /> {t("shareLabelFacebook")}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={shareLinks.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Send className="h-4 w-4 mr-2" /> {t("shareLabelLinkedIn")}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={shareLinks.email}>
                  <Mail className="h-4 w-4 mr-2" /> {t("shareLabelEmail")}
                </a>
              </Button>
            </div>

            <Separator />

            <div className="flex gap-2 items-center">
              <Input readOnly value={shareUrl} className="text-xs" />
              <Button variant="secondary" onClick={copyLink}>
                <Copy className="h-4 w-4 mr-2" /> {t("shareCopyBtn")}
              </Button>
            </div>

            <div className="flex items-center text-xs text-muted-foreground">
              <LinkIcon className="h-3 w-3 mr-1" />
              {t("shareCurrentUrlNote")}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* WRITE REVIEW DIALOG */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("writeReviewTitle")}</DialogTitle>
          </DialogHeader>
          <ReviewForm
            onCancel={() => setShowReviewDialog(false)}
            onSubmit={(data) => submitReview(data)}
          />
        </DialogContent>
      </Dialog>

      {/* Sticky bottom action bar — mobile only. The component itself
          handles the md:hidden gating, safe-area padding, and lifting
          the FloatingWhatsApp button via a CSS variable. */}
      {product && (
        <MobileBuyBar
          inWishlist={inWishlist}
          inCart={inCart}
          isAddingToCart={isAddingToCart}
          isBuyingNow={isBuyingNow}
          isOutOfStock={isOutOfStock}
          onWishlistToggle={handleWishlistToggle}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
        />
      )}

    </CustomerLayout>
  );
}

/* --------- Small review form component --------- */
function ReviewForm(props: {
  onSubmit: (v: {
    rating: number;
    title: string;
    body: string;
    photos: string[];
  }) => Promise<void> | void;
  onCancel: () => void;
}) {
  const t = useTranslations("pdp");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]); // storage paths
  const [previews, setPreviews] = useState<string[]>([]); // public URLs for UI

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const paths: string[] = [];
    const urls: string[] = [];
    for (const f of Array.from(files).slice(0, 6 - photos.length)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 4 * 1024 * 1024) {
        toast.error(t("reviewPhotoTooLarge"));
        continue;
      }
      const ext = f.name.split(".").pop() || "jpg";
      const key = `uploads/${randomKey()}.${ext}`;
      try {
        const { path, publicUrl } = await uploadMedia("review-media", key, f, {
          upsert: false,
        });
        paths.push(path);
        if (publicUrl) urls.push(publicUrl);
      } catch {
        toast.error(t("reviewPhotoUploadFail"));
      }
    }
    setPhotos((p) => [...p, ...paths]);
    setPreviews((p) => [...p, ...urls]);
    setUploading(false);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!rating) return;
        if (submitting) return;
        try {
          setSubmitting(true);
          await props.onSubmit({ rating, title, body, photos });
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div>
        <Label className="mb-1 block">{t("yourRatingLabel")}</Label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i)}
              className="p-1"
              aria-label={t("starLabel", { rating: i })}
              title={t("starLabel", { rating: i })}
            >
              <Star
                className={`h-6 w-6 ${
                  i <= rating
                    ? "fill-yellow-400 text-yellow-500"
                    : "text-muted-foreground"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="review-title" className="mb-1 block">
          {t("reviewTitleLabel")}
        </Label>
        <Input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("reviewTitlePlaceholder")}
        />
      </div>

      <div>
        <Label htmlFor="review-body" className="mb-1 block">
          {t("reviewBodyLabel")}
        </Label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full border rounded-md p-2 text-sm min-h-[120px] bg-background"
          placeholder={t("reviewBodyPlaceholder")}
          required
        />
      </div>

      <div>
        <Label className="mb-1 block">{t("reviewPhotosLabel")}</Label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
        {previews.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {previews.map((u, i) => (
              <div
                key={i}
                className="relative w-20 h-20 rounded overflow-hidden border flex-shrink-0"
              >
                <Image
                  src={u}
                  alt={`preview ${i + 1}`}
                  fill
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPhotos((p) => p.filter((_, idx) => idx !== i));
                    setPreviews((p) => p.filter((_, idx) => idx !== i));
                  }}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1"
                  title={t("removeTitle")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {uploading && (
          <p className="text-xs text-muted-foreground mt-1">{t("reviewUploading")}</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" type="button" onClick={props.onCancel} disabled={uploading || submitting}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={uploading || submitting}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}
