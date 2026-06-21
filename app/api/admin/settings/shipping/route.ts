export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { bustShippingConfigCache, getShippingConfig } from "@/lib/storeSettings";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const config = await getShippingConfig();
  return json({
    ok: true,
    deliveryThreshold: config.deliveryThreshold,
    defaultShippingFee: config.defaultShippingFee,
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const deliveryThreshold = Number(body.deliveryThreshold);
  const defaultShippingFee = Number(body.defaultShippingFee);

  if (
    !Number.isFinite(deliveryThreshold) ||
    !Number.isFinite(defaultShippingFee) ||
    deliveryThreshold < 0 ||
    defaultShippingFee < 0
  ) {
    return json({ ok: false, error: "INVALID_VALUES" }, 400);
  }

  const { error: upErr } = await supabase
    .from("store_settings")
    .update({
      delivery_threshold: Math.round(deliveryThreshold),
      default_shipping_fee: Math.round(defaultShippingFee),
      updated_at: new Date().toISOString(),
      updated_by: user!.id,
    })
    .eq("id", 1);

  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  // Drop the in-process cache so the next pricing call sees the new values
  // immediately instead of waiting out the 60s TTL.
  bustShippingConfigCache();

  // Dual-write: under CATALOG_BACKEND=mysql the live cart/checkout shipping math
  // (getShippingConfig / recalcCartTotalsMysql) reads delivery_threshold +
  // default_shipping_fee from MySQL, so a Supabase-only update would have no
  // effect on real shipping fees until an ETL re-sync.
  try {
    const { mirrorTableToMysql } = await import("@/lib/data/mirror");
    await mirrorTableToMysql("store_settings");
  } catch (e) {
    console.error("[dual-write] shipping settings MySQL mirror failed:", e);
  }

  return json({
    ok: true,
    deliveryThreshold: Math.round(deliveryThreshold),
    defaultShippingFee: Math.round(defaultShippingFee),
  });
}
