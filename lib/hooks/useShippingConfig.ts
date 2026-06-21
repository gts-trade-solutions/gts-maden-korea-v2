"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SHIPPING_CONFIG,
  type ShippingConfig,
} from "@/lib/membership";

/**
 * Fetch the live shipping config (free-delivery threshold + flat fee)
 * for cart / checkout previews. Until the fetch resolves, callers see
 * the compiled-in fallback so the UI doesn't flash empty values; the
 * authoritative pricing still happens in /api/checkout/calc-totals.
 *
 * The fetched value is cached in module scope so multiple components
 * mounting on the same page share a single network request.
 */
let memoryCache: ShippingConfig | null = null;
let inflight: Promise<ShippingConfig> | null = null;

async function load(): Promise<ShippingConfig> {
  if (memoryCache) return memoryCache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/shipping/config", { cache: "no-store" });
      if (!res.ok) return DEFAULT_SHIPPING_CONFIG;
      const data = await res.json();
      const value: ShippingConfig = {
        deliveryThreshold:
          Number(data?.deliveryThreshold) ||
          DEFAULT_SHIPPING_CONFIG.deliveryThreshold,
        defaultShippingFee:
          Number(data?.defaultShippingFee) ||
          DEFAULT_SHIPPING_CONFIG.defaultShippingFee,
      };
      memoryCache = value;
      return value;
    } catch {
      return DEFAULT_SHIPPING_CONFIG;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useShippingConfig(): ShippingConfig {
  const [config, setConfig] = useState<ShippingConfig>(
    memoryCache ?? DEFAULT_SHIPPING_CONFIG
  );

  useEffect(() => {
    let cancelled = false;
    load().then((value) => {
      if (!cancelled) setConfig(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}

/** Drop the cached value — call this after admin updates settings. */
export function invalidateShippingConfigCache() {
  memoryCache = null;
}
