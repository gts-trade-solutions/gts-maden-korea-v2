import "server-only";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Influencer dashboard reads, ported from the Supabase /api/me/* routes to
// MySQL behind CATALOG_BACKEND. Supabase remains authoritative (writes still
// dual-write); these read the mirrored MySQL copy. Auth (user id) is resolved
// by the caller — only the DB reads move here.

// Prisma Decimal class name is minified in the bundle, so duck-type toNumber
// (same approach as lib/db/serialize.ts) rather than instanceof.
const num = (v: any): number =>
  v == null ? 0 : typeof v?.toNumber === "function" ? v.toNumber() : Number(v) || 0;

export type InfluencerSummary = {
  lifetime_commission: number;
  pending_total: number;
  paid_total: number;
  available_to_withdraw: number;
  commission_cap_pct: number | null;
  default_user_discount_pct: number | null;
  applicable_countries: string[];
};

// Mirror of /api/me/summary's three-table aggregation.
export async function getInfluencerSummaryMysql(userId: string): Promise<InfluencerSummary> {
  const [attrs, payouts, prof] = await Promise.all([
    prisma.order_attributions.findMany({
      where: { influencer_id: userId },
      select: { commission_amount: true, status: true },
    }),
    prisma.influencer_payouts.findMany({
      where: { influencer_id: userId },
      select: { amount: true, status: true },
    }),
    prisma.influencer_profiles.findUnique({
      where: { user_id: userId },
      select: {
        commission_cap_pct: true,
        default_user_discount_pct: true,
        applicable_countries: true,
      },
    }),
  ]);

  const lifetime = attrs.reduce((s, r) => s + num(r.commission_amount), 0);
  const approvedCommission = attrs
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + num(r.commission_amount), 0);

  const pendingPayout = payouts
    .filter((r) => ["pending", "initiated", "processing"].includes(String(r.status)))
    .reduce((s, r) => s + num(r.amount), 0);
  const paidPayout = payouts
    .filter((r) => String(r.status) === "paid")
    .reduce((s, r) => s + num(r.amount), 0);

  const available = Math.max(0, approvedCommission - (pendingPayout + paidPayout));

  const applicableCountries = Array.isArray(prof?.applicable_countries)
    ? (prof!.applicable_countries as string[])
    : [];

  return {
    lifetime_commission: lifetime,
    pending_total: pendingPayout,
    paid_total: paidPayout,
    available_to_withdraw: available,
    commission_cap_pct: prof?.commission_cap_pct != null ? Number(prof.commission_cap_pct) : null,
    default_user_discount_pct:
      prof?.default_user_discount_pct != null ? Number(prof.default_user_discount_pct) : null,
    applicable_countries: applicableCountries,
  };
}

// /api/me/payouts — payout history for the influencer.
export async function getInfluencerPayoutsMysql(userId: string) {
  const rows = await prisma.influencer_payouts.findMany({
    where: { influencer_id: userId },
    orderBy: { created_at: "desc" },
    select: {
      id: true, amount: true, currency: true, status: true, method: true,
      request_note: true, contact_email: true, settled_reference: true,
      created_at: true, paid_at: true,
    },
  });
  return jsonSafe(rows);
}

// /api/me/wallet — raw payout_meta jsonb (the route sanitizes it).
export async function getWalletMetaMysql(userId: string): Promise<any> {
  const prof = await prisma.influencer_profiles.findUnique({
    where: { user_id: userId },
    select: { payout_meta: true },
  });
  return prof?.payout_meta ?? {};
}

// /api/influencer/promos — GLOBAL promos only (product_id null).
export async function getGlobalPromosMysql(userId: string) {
  const rows = await prisma.promo_codes.findMany({
    where: { influencer_id: userId, product_id: null },
    orderBy: { created_at: "desc" },
    select: {
      id: true, code: true, product_id: true, active: true,
      discount_percent: true, commission_percent: true, uses: true, max_uses: true,
    },
  });
  return jsonSafe(rows);
}

// /api/me/promos — all promos (any scope) + product name/slug join.
export async function getAllPromosMysql(userId: string) {
  const rows = await prisma.promo_codes.findMany({
    where: { influencer_id: userId },
    orderBy: { created_at: "desc" },
    select: {
      id: true, code: true, scope: true, product_id: true,
      discount_percent: true, commission_percent: true, active: true, uses: true,
    },
  });
  const ids = Array.from(new Set(rows.map((r) => r.product_id).filter(Boolean))) as string[];
  const map: Record<string, { name: string; slug: string }> = {};
  if (ids.length) {
    const prods = await prisma.products.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, slug: true },
    });
    for (const p of prods) map[p.id] = { name: p.name, slug: p.slug as string };
  }
  return rows.map((p) => ({
    ...(jsonSafe(p) as any),
    product_name: p.product_id ? map[p.product_id]?.name ?? null : null,
    product_slug: p.product_id ? map[p.product_id]?.slug ?? null : null,
  }));
}

// /api/me/display-currency (GET) — locked dashboard currency.
export async function getDisplayCurrencyMysql(userId: string): Promise<string> {
  const prof = await prisma.influencer_profiles.findUnique({
    where: { user_id: userId },
    select: { display_currency: true },
  });
  return prof?.display_currency || "INR";
}

// /api/me/influencer — narrow profile for share-link building.
export async function getInfluencerProfileMysql(userId: string) {
  const prof = await prisma.influencer_profiles.findUnique({
    where: { user_id: userId },
    select: { handle: true, display_name: true, active: true, applicable_countries: true },
  });
  return prof ? (jsonSafe(prof) as any) : null;
}

// Mirror a promo write (create/edit) into MySQL. The dashboard reads promos
// from MySQL AND checkout resolves promo codes from MySQL (getPromoDetailsMysql),
// so a Supabase-only promo write wouldn't appear or work under the flag. Reads
// the row back via the caller's client (RLS-scoped to the owner) and upserts.
const PROMO_FIELDS =
  "id, influencer_id, code, product_id, discount_percent, commission_percent, cap_percent, " +
  "starts_at, expires_at, max_uses, uses, active, created_at, scope";

export async function mirrorPromoIntoMysql(sb: any, promoId: string): Promise<void> {
  const { data: p } = await sb.from("promo_codes").select(PROMO_FIELDS).eq("id", promoId).maybeSingle();
  if (!p) return;
  const data: any = {
    id: p.id,
    influencer_id: p.influencer_id,
    code: p.code,
    product_id: p.product_id ?? null,
    discount_percent: p.discount_percent ?? 0,
    commission_percent: p.commission_percent ?? 0,
    cap_percent: p.cap_percent ?? 0,
    starts_at: p.starts_at ? new Date(p.starts_at) : null,
    expires_at: p.expires_at ? new Date(p.expires_at) : null,
    max_uses: p.max_uses ?? null,
    uses: p.uses ?? 0,
    active: p.active ?? true,
    scope: p.scope ?? "global",
    ...(p.created_at ? { created_at: new Date(p.created_at) } : {}),
  };
  await prisma.promo_codes.upsert({ where: { id: p.id }, update: data, create: data });
}

export async function deletePromoFromMysql(promoId: string): Promise<void> {
  await prisma.promo_codes.deleteMany({ where: { id: promoId } });
}

// Mirror influencer_profiles editable fields into MySQL after a self-serve
// write (wallet save, display-currency change). Re-reads the authoritative
// Supabase row and updates the (migrated) MySQL row. Best-effort caller.
export async function mirrorInfluencerProfileIntoMysql(sb: any, userId: string): Promise<void> {
  const { data: p } = await sb
    .from("influencer_profiles")
    .select(
      "payout_meta, display_currency, display_name, active, applicable_countries, commission_cap_pct, default_user_discount_pct"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!p) return;
  await prisma.influencer_profiles.update({
    where: { user_id: userId },
    data: {
      payout_meta: p.payout_meta ?? {},
      display_currency: p.display_currency ?? "INR",
      display_name: p.display_name ?? null,
      active: p.active ?? true,
      applicable_countries: p.applicable_countries ?? [],
      ...(p.commission_cap_pct != null ? { commission_cap_pct: Number(p.commission_cap_pct) } : {}),
      ...(p.default_user_discount_pct != null
        ? { default_user_discount_pct: Number(p.default_user_discount_pct) }
        : {}),
    },
  });
}

// Mirror a payout request into MySQL (read by summary + payouts). The dashboard
// "available to withdraw" + pending list read MySQL, so a Supabase-only payout
// insert would leave them stale. Reads the row back via the caller's client.
const PAYOUT_FIELDS =
  "id, influencer_id, amount, currency, covering_orders, status, notes, created_at, paid_at, " +
  "method, request_note, contact_email, settled_reference";

export async function mirrorPayoutIntoMysql(sb: any, payoutId: string): Promise<void> {
  const { data: p } = await sb.from("influencer_payouts").select(PAYOUT_FIELDS).eq("id", payoutId).maybeSingle();
  if (!p) return;
  const data: any = {
    id: p.id,
    influencer_id: p.influencer_id,
    amount: p.amount ?? 0,
    currency: p.currency ?? "INR",
    covering_orders: p.covering_orders ?? [],
    status: p.status ?? "initiated",
    notes: p.notes ?? null,
    paid_at: p.paid_at ? new Date(p.paid_at) : null,
    method: p.method ?? "manual",
    request_note: p.request_note ?? null,
    contact_email: p.contact_email ?? null,
    settled_reference: p.settled_reference ?? null,
    ...(p.created_at ? { created_at: new Date(p.created_at) } : {}),
  };
  await prisma.influencer_payouts.upsert({ where: { id: p.id }, update: data, create: data });
}

// Mirror the user's latest influencer application into MySQL (read by status).
// MySQL enforces one request per user (unique user_id), so we replace any
// existing row with the freshest Supabase row.
export async function mirrorInfluencerRequestIntoMysql(sb: any, userId: string): Promise<void> {
  const { data: r } = await sb
    .from("influencer_requests")
    .select("id, user_id, handle, social, note, status, reviewed_by, reviewed_at, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!r) return;
  await prisma.influencer_requests.deleteMany({ where: { user_id: userId } });
  await prisma.influencer_requests.create({
    data: {
      id: r.id,
      user_id: r.user_id,
      handle: r.handle ?? null,
      social: r.social ?? {},
      note: r.note ?? null,
      status: r.status ?? "pending",
      reviewed_by: r.reviewed_by ?? null,
      reviewed_at: r.reviewed_at ? new Date(r.reviewed_at) : null,
      ...(r.created_at ? { created_at: new Date(r.created_at) } : {}),
      ...(r.updated_at ? { updated_at: new Date(r.updated_at) } : {}),
    },
  });
}

// /api/influencer/status — admin / influencer / pending / rejected / none.
export async function getInfluencerStatusMysql(
  userId: string
): Promise<{ status: string; requested_at: string | null }> {
  const profile = await prisma.profiles.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (profile?.role === "admin" || profile?.role === "super_admin") {
    return { status: "admin", requested_at: null };
  }
  const infl = await prisma.influencer_profiles.findUnique({
    where: { user_id: userId },
    select: { active: true },
  });
  if (infl?.active) return { status: "influencer", requested_at: null };

  const req = await prisma.influencer_requests.findFirst({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    select: { status: true, created_at: true },
  });
  const at = req?.created_at ? new Date(req.created_at).toISOString() : null;
  if (req?.status === "pending") return { status: "pending", requested_at: at };
  if (req?.status === "rejected") return { status: "rejected", requested_at: at };
  return { status: "none", requested_at: null };
}
