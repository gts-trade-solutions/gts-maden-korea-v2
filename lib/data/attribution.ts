import "server-only";
import { prisma } from "@/lib/db/prisma";

// Mirror the influencer commission ledger writes that razorpay/verify makes
// (order_attributions row + promo_codes.uses increment) into MySQL, so once the
// influencer dashboards read from MySQL their earnings/usage numbers are correct.
// Supabase stays authoritative; both are best-effort callers.

const OA_FIELDS =
  "order_id, influencer_id, referral_id, promo_code_id, attributed_by, discount_percent, " +
  "commission_percent, commission_amount, currency, status, created_at, user_discount_total, commission_total";

export async function mirrorOrderAttributionIntoMysql(sb: any, orderId: string): Promise<void> {
  const { data: a } = await sb
    .from("order_attributions")
    .select(OA_FIELDS)
    .eq("order_id", orderId)
    .maybeSingle();
  if (!a) return;

  const data: any = {
    order_id: a.order_id,
    influencer_id: a.influencer_id,
    referral_id: a.referral_id ?? null,
    promo_code_id: a.promo_code_id ?? null,
    attributed_by: a.attributed_by ?? "promo",
    discount_percent: a.discount_percent ?? 0,
    commission_percent: a.commission_percent ?? 0,
    commission_amount: a.commission_amount ?? 0,
    currency: a.currency ?? "INR",
    status: a.status ?? "approved",
    user_discount_total: a.user_discount_total ?? 0,
    commission_total: a.commission_total ?? 0,
    ...(a.created_at ? { created_at: new Date(a.created_at) } : {}),
  };
  await prisma.order_attributions.upsert({ where: { order_id: orderId }, update: data, create: data });
}

// Re-read the promo's mutable counters after increment_promo_use ran in Supabase
// (it bumps `uses` and may flip `active` off when max_uses is hit) and mirror
// them onto the MySQL row.
export async function mirrorPromoUsesIntoMysql(sb: any, promoId: string): Promise<void> {
  const { data: p } = await sb
    .from("promo_codes")
    .select("uses, active")
    .eq("id", promoId)
    .maybeSingle();
  if (!p) return;
  await prisma.promo_codes.update({
    where: { id: promoId },
    data: { uses: p.uses ?? 0, active: p.active ?? true },
  });
}
