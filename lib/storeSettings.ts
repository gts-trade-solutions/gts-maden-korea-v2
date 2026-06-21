import "server-only";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { DEFAULT_SHIPPING_CONFIG, type ShippingConfig } from "@/lib/membership";

const CACHE_TTL_MS = 60 * 1000;

let cached: { value: ShippingConfig; expiresAt: number } | null = null;

/**
 * Read the live shipping config from `public.store_settings`. Cached for
 * 60 seconds in process memory so calc-totals doesn't hammer Supabase on
 * every request. Falls back to {@link DEFAULT_SHIPPING_CONFIG} if the
 * table or row is missing — never throws.
 *
 * On admin update, call {@link bustShippingConfigCache} so the change
 * shows up in the next pricing call instead of waiting out the TTL.
 */
export async function getShippingConfig(): Promise<ShippingConfig> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    if (process.env.CATALOG_BACKEND === "mysql") {
      const { prisma } = await import("@/lib/db/prisma");
      const row = await prisma.store_settings.findUnique({
        where: { id: 1 },
        select: { delivery_threshold: true, default_shipping_fee: true },
      });
      const value: ShippingConfig = {
        deliveryThreshold: Number(row?.delivery_threshold ?? DEFAULT_SHIPPING_CONFIG.deliveryThreshold),
        defaultShippingFee: Number(row?.default_shipping_fee ?? DEFAULT_SHIPPING_CONFIG.defaultShippingFee),
      };
      cached = { value, expiresAt: now + CACHE_TTL_MS };
      return value;
    }
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("store_settings")
      .select("delivery_threshold, default_shipping_fee")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) {
      cached = { value: DEFAULT_SHIPPING_CONFIG, expiresAt: now + CACHE_TTL_MS };
      return DEFAULT_SHIPPING_CONFIG;
    }

    const value: ShippingConfig = {
      deliveryThreshold: Number(data.delivery_threshold ?? DEFAULT_SHIPPING_CONFIG.deliveryThreshold),
      defaultShippingFee: Number(data.default_shipping_fee ?? DEFAULT_SHIPPING_CONFIG.defaultShippingFee),
    };
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cached = { value: DEFAULT_SHIPPING_CONFIG, expiresAt: now + CACHE_TTL_MS };
    return DEFAULT_SHIPPING_CONFIG;
  }
}

export function bustShippingConfigCache() {
  cached = null;
}

// ─── Home video carousel cap ───────────────────────────────────────
//
// Admin-editable upper bound on the number of product videos rendered
// on the home page. Lives in `store_settings.home_video_limit` and is
// edited from /admin/cms/product-video. Same 60s in-process cache as
// the shipping config; admin write endpoint busts it on save.

const DEFAULT_HOME_VIDEO_LIMIT = 16;
const HARD_MAX_HOME_VIDEO_LIMIT = 50;
let cachedHomeVideoLimit: { value: number; expiresAt: number } | null = null;

export async function getHomeVideoLimit(): Promise<number> {
  const now = Date.now();
  if (cachedHomeVideoLimit && cachedHomeVideoLimit.expiresAt > now)
    return cachedHomeVideoLimit.value;

  try {
    if (process.env.CATALOG_BACKEND === "mysql") {
      const { prisma } = await import("@/lib/db/prisma");
      const row = await prisma.store_settings.findUnique({
        where: { id: 1 },
        select: { home_video_limit: true },
      });
      const raw = Number(row?.home_video_limit ?? DEFAULT_HOME_VIDEO_LIMIT);
      const value = Number.isFinite(raw)
        ? Math.max(1, Math.min(HARD_MAX_HOME_VIDEO_LIMIT, Math.floor(raw)))
        : DEFAULT_HOME_VIDEO_LIMIT;
      cachedHomeVideoLimit = { value, expiresAt: now + CACHE_TTL_MS };
      return value;
    }
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("store_settings")
      .select("home_video_limit")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) {
      cachedHomeVideoLimit = {
        value: DEFAULT_HOME_VIDEO_LIMIT,
        expiresAt: now + CACHE_TTL_MS,
      };
      return DEFAULT_HOME_VIDEO_LIMIT;
    }

    // Clamp at read time too — defensive against a manual SQL edit that
    // bypasses the API. Carousel rendering 200 videos would melt the
    // home page; bounding here keeps that contained.
    const raw = Number(data.home_video_limit ?? DEFAULT_HOME_VIDEO_LIMIT);
    const value = Number.isFinite(raw)
      ? Math.max(1, Math.min(HARD_MAX_HOME_VIDEO_LIMIT, Math.floor(raw)))
      : DEFAULT_HOME_VIDEO_LIMIT;
    cachedHomeVideoLimit = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    cachedHomeVideoLimit = {
      value: DEFAULT_HOME_VIDEO_LIMIT,
      expiresAt: now + CACHE_TTL_MS,
    };
    return DEFAULT_HOME_VIDEO_LIMIT;
  }
}

export function bustHomeVideoLimitCache() {
  cachedHomeVideoLimit = null;
}

export const HOME_VIDEO_LIMIT_BOUNDS = {
  default: DEFAULT_HOME_VIDEO_LIMIT,
  min: 1,
  max: HARD_MAX_HOME_VIDEO_LIMIT,
} as const;
