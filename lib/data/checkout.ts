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

// Mirrors the Supabase RPC public.get_promo_details(p_code) exactly:
//   where upper(trim(code)) = upper(trim(p_code))
//     and coalesce(active,false) = true
//     and (starts_at is null or starts_at <= now())
//     and (expires_at is null or expires_at >= now())   -- inclusive
//     and (max_uses is null or coalesce(uses,0) < max_uses)
//   scope := case when product_id is null then 'global' else 'product' end
// Returns { id, code, influencer_id, product_id, scope, discount_percent,
//           user_discount_percent (= discount_percent), commission_percent }.
export async function getPromoDetailsMysql(code: string) {
  const now = new Date();
  const pc = await prisma.promo_codes.findFirst({
    where: {
      code: code.toUpperCase().trim(),
      active: true,
      AND: [
        { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
        { OR: [{ expires_at: null }, { expires_at: { gte: now } }] },
      ],
    },
    select: {
      id: true, code: true, influencer_id: true, product_id: true,
      discount_percent: true, commission_percent: true,
      max_uses: true, uses: true,
    },
  });
  if (!pc) return null;
  // max_uses guard: Prisma cannot compare two columns in `where`, so the
  // RPC's `coalesce(uses,0) < max_uses` clause is enforced here.
  if (pc.max_uses != null && (pc.uses ?? 0) >= pc.max_uses) return null;
  return jsonSafe({
    id: pc.id,
    code: pc.code,
    influencer_id: pc.influencer_id,
    product_id: pc.product_id,
    // scope is derived from product_id (mirrors the RPC), not the column.
    scope: pc.product_id == null ? "global" : "product",
    discount_percent: pc.discount_percent,
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
