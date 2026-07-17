import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import {
  CONCERN_KEYS,
  concernLabel,
  concernDescription,
  DEFAULT_RECO_THRESHOLD,
} from "@/lib/integrations/skinConcerns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full concern catalog with per-concern settings + attached products.
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const [settings, maps] = await Promise.all([
    prisma.skinConcernSetting.findMany(),
    prisma.skinConcernProduct.findMany({
      orderBy: [{ concernType: "asc" }, { position: "asc" }],
    }),
  ]);
  const settingMap = new Map(settings.map((s) => [s.concernType, s]));

  const productIds = Array.from(new Set(maps.map((m) => m.productId)));
  const products = productIds.length
    ? await prisma.products.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const pMap = new Map(products.map((p) => [p.id, p]));

  const concerns = CONCERN_KEYS.map((key) => {
    const s = settingMap.get(key);
    return {
      concernType: key,
      label: concernLabel(key),
      description: concernDescription(key),
      threshold: s?.threshold ?? DEFAULT_RECO_THRESHOLD,
      enabled: s?.enabled ?? true,
      products: maps
        .filter((m) => m.concernType === key)
        .map((m) => {
          const p = pMap.get(m.productId);
          return {
            productId: m.productId,
            name: p?.name ?? "(deleted product)",
            slug: p?.slug ?? null,
          };
        }),
    };
  });

  return NextResponse.json({ concerns });
}

// Update a concern's threshold and/or enabled flag.
export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const concernType = body?.concernType;
  if (!concernType || !CONCERN_KEYS.includes(concernType)) {
    return NextResponse.json({ error: "bad_concern" }, { status: 400 });
  }

  const data: { threshold?: number; enabled?: boolean } = {};
  if (typeof body.threshold === "number") {
    data.threshold = Math.max(0, Math.min(1, body.threshold));
  }
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  await prisma.skinConcernSetting.upsert({
    where: { concernType },
    update: data,
    create: { concernType, ...data },
  });
  return NextResponse.json({ ok: true });
}
