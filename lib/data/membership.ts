import "server-only";
import { prisma } from "@/lib/db/prisma";

// Mirror a user's Supabase user_memberships rows into MySQL. Membership WRITES
// (purchase in /api/membership/verify, expiry in /api/membership/sync-status)
// stay authoritative in Supabase during the transition; the cart/checkout math
// reads membership from MySQL (getActiveMembershipMysql + recalcCartTotalsMysql),
// so without this a freshly-purchased K-Plus member would still be charged
// shipping on the MySQL path. Re-reads ALL of the user's rows and upserts them
// (covers new active rows AND active→expired status flips). Best-effort caller.
const FIELDS =
  "id, user_id, plan_code, plan_name, amount, duration_days, status, " +
  "starts_at, ends_at, payment_id, order_id, created_at, updated_at";

export async function mirrorMembershipsIntoMysql(sb: any, userId: string): Promise<void> {
  const { data: rows } = await sb
    .from("user_memberships")
    .select(FIELDS)
    .eq("user_id", userId);
  if (!rows?.length) return;

  for (const m of rows as any[]) {
    const data: any = {
      id: m.id,
      user_id: m.user_id,
      plan_code: m.plan_code ?? "k_plus",
      plan_name: m.plan_name ?? "K-Plus",
      amount: m.amount ?? 199,
      duration_days: m.duration_days ?? 90,
      status: m.status ?? "active",
      starts_at: m.starts_at ? new Date(m.starts_at) : new Date(),
      ends_at: m.ends_at ? new Date(m.ends_at) : new Date(),
      payment_id: m.payment_id ?? null,
      order_id: m.order_id ?? null,
      ...(m.created_at ? { created_at: new Date(m.created_at) } : {}),
      ...(m.updated_at ? { updated_at: new Date(m.updated_at) } : {}),
    };
    await prisma.user_memberships.upsert({ where: { id: m.id }, update: data, create: data });
  }
}
