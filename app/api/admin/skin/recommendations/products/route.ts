import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { CONCERN_KEYS } from "@/lib/integrations/skinConcerns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Attach a product to a concern (appended at the end).
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { concernType, productId } = body ?? {};
  if (!concernType || !CONCERN_KEYS.includes(concernType) || !productId) {
    return NextResponse.json({ error: "bad_input" }, { status: 400 });
  }

  // Only active (published, non-deleted) products may be suggested.
  const product = await prisma.products.findUnique({
    where: { id: productId },
    select: { id: true, is_published: true, deleted_at: true },
  });
  if (!product || !product.is_published || product.deleted_at) {
    return NextResponse.json({ error: "product_not_active" }, { status: 400 });
  }

  const position = await prisma.skinConcernProduct.count({
    where: { concernType },
  });
  await prisma.skinConcernProduct.upsert({
    where: { concernType_productId: { concernType, productId } },
    update: {},
    create: { concernType, productId, position },
  });
  return NextResponse.json({ ok: true });
}

// Detach a product from a concern.
export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const { concernType, productId } = body ?? {};
  if (!concernType || !productId) {
    return NextResponse.json({ error: "bad_input" }, { status: 400 });
  }
  await prisma.skinConcernProduct.deleteMany({
    where: { concernType, productId },
  });
  return NextResponse.json({ ok: true });
}
