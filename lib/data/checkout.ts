import "server-only";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// MySQL read helpers for the (read-only) calc-totals route.

export async function getCheckoutProductsMysql(productIds: string[]) {
  const rows = await prisma.products.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true, name: true, price: true, currency: true, is_published: true,
      promo_exempt: true, sale_price: true, sale_starts_at: true, sale_ends_at: true,
      stock_qty: true, net_weight_g: true, gross_weight_g: true,
    },
  });
  return jsonSafe(rows) as any[];
}

// Mirrors get_promo_details: active promo within its validity window.
export async function getPromoDetailsMysql(code: string) {
  const now = new Date();
  const pc = await prisma.promo_codes.findFirst({
    where: {
      code: code.toUpperCase(),
      active: true,
      AND: [
        { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
        { OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      ],
    },
    select: {
      id: true, code: true, scope: true, influencer_id: true, product_id: true,
      discount_percent: true, commission_percent: true,
    },
  });
  if (!pc) return null;
  return jsonSafe({
    ...pc,
    user_discount_percent: pc.discount_percent,
    commission_percent: pc.commission_percent,
  });
}

export async function getInfluencerCapMysql(influencerId: string) {
  const prof = await prisma.influencer_profiles.findFirst({
    where: { user_id: influencerId },
    select: { commission_cap_pct: true, applicable_countries: true },
  });
  return prof ? (jsonSafe(prof) as any) : null;
}

export async function getActiveMembershipMysql(userId: string) {
  const m = await prisma.user_memberships.findFirst({
    where: { user_id: userId, status: "active", ends_at: { gt: new Date() } },
    orderBy: { ends_at: "desc" },
    select: { status: true, ends_at: true },
  });
  return m ? (jsonSafe(m) as any) : null;
}
