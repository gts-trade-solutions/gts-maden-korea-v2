export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { bustShippingConfigCache, getShippingConfig } from "@/lib/storeSettings";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const config = await getShippingConfig();
  return json(
    jsonSafe({
      ok: true,
      deliveryThreshold: config.deliveryThreshold,
      defaultShippingFee: config.defaultShippingFee,
    })
  );
}

export async function POST(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

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

  try {
    await prisma.store_settings.update({
      where: { id: 1 },
      data: {
        delivery_threshold: Math.round(deliveryThreshold),
        default_shipping_fee: Math.round(defaultShippingFee),
        updated_at: new Date(),
        updated_by: user!.id,
      },
    });
  } catch (upErr: any) {
    return json({ ok: false, error: upErr?.message ?? "Update failed" }, 500);
  }

  // Drop the in-process cache so the next pricing call sees the new values
  // immediately instead of waiting out the 60s TTL.
  bustShippingConfigCache();

  return json({
    ok: true,
    deliveryThreshold: Math.round(deliveryThreshold),
    defaultShippingFee: Math.round(defaultShippingFee),
  });
}
