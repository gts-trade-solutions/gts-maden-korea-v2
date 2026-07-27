import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getKPointsSettings, getPointsPerUnit, getEarnRule } from "@/lib/k-points/config";
import type { LedgerReason } from "@/lib/k-points/constants";
import { roundMoney } from "@/lib/currency";

const RESERVATION_TTL_MS = 60 * 60 * 1000; // 60 min to complete payment

export type KPointsBalance = {
  available: number;
  reserved: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
};

const ZERO: KPointsBalance = {
  available: 0,
  reserved: 0,
  lifetimeEarned: 0,
  lifetimeSpent: 0,
};

export class KPointsError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as any).code === "P2002";
}

export async function getBalance(userId: string): Promise<KPointsBalance> {
  const b = await prisma.kPointsBalance.findUnique({ where: { userId } });
  if (!b) return { ...ZERO };
  return {
    available: b.available,
    reserved: b.reserved,
    lifetimeEarned: b.lifetimeEarned,
    lifetimeSpent: b.lifetimeSpent,
  };
}

// Core mutation: append one ledger row + move the cached balance, atomically.
// Idempotent on (sourceType, sourceId, reason) — a duplicate is a no-op.
async function applyEntry(args: {
  userId: string;
  delta: number; // + earn, - spend
  reason: LedgerReason;
  sourceType: string;
  sourceId: string;
  status?: string;
  expiresAt?: Date | null;
  meta?: any;
}): Promise<{ applied: boolean; balance: KPointsBalance }> {
  const {
    userId,
    delta,
    reason,
    sourceType,
    sourceId,
    status = delta >= 0 ? "available" : "settled",
    expiresAt = null,
    meta = null,
  } = args;

  if (!Number.isInteger(delta) || delta === 0) {
    throw new KPointsError("BAD_DELTA", "delta must be a non-zero integer");
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Idempotency guard — a duplicate (sourceType, sourceId, reason) throws
      // P2002 and rolls the whole tx back, so the balance is never touched twice.
      await tx.kPointsLedger.create({
        data: { id: randomUUID(), userId, delta, reason, sourceType, sourceId, status, expiresAt, meta },
      });

      if (delta > 0) {
        // Atomic increment — safe under concurrency (no read-modify-write).
        await tx.kPointsBalance.upsert({
          where: { userId },
          create: { userId, available: delta, lifetimeEarned: delta, reserved: 0, version: 1 },
          update: {
            available: { increment: delta },
            lifetimeEarned: { increment: delta },
            version: { increment: 1 },
          },
        });
      } else {
        // Conditional decrement — only succeeds if enough is available, so the
        // balance can never go negative even with concurrent spends.
        const spent = -delta;
        const res = await tx.kPointsBalance.updateMany({
          where: { userId, available: { gte: spent } },
          data: {
            available: { decrement: spent },
            lifetimeSpent: { increment: spent },
            version: { increment: 1 },
          },
        });
        if (res.count === 0) throw new KPointsError("INSUFFICIENT_POINTS");
      }
    });
    return { applied: true, balance: await getBalance(userId) };
  } catch (e) {
    if (isUniqueViolation(e)) return { applied: false, balance: await getBalance(userId) }; // already recorded
    throw e;
  }
}

// Credit earned points. Idempotent per (sourceType, sourceId, reason).
export async function earn(args: {
  userId: string;
  points: number;
  reason: LedgerReason;
  sourceType: string;
  sourceId: string;
  meta?: any;
}): Promise<{ applied: boolean; balance: KPointsBalance }> {
  const points = Math.floor(args.points);
  if (points <= 0) return { applied: false, balance: await getBalance(args.userId) };
  const settings = await getKPointsSettings();
  const expiresAt =
    settings.pointsExpiryDays > 0
      ? new Date(Date.now() + settings.pointsExpiryDays * 24 * 60 * 60 * 1000)
      : null;
  return applyEntry({
    userId: args.userId,
    delta: points,
    reason: args.reason,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    expiresAt,
    meta: args.meta ?? null,
  });
}

// Spend points immediately (e.g. to unlock the skin analyzer). Idempotent per
// (sourceType, sourceId, reason). Throws KPointsError("INSUFFICIENT_POINTS")
// if the balance can't cover it.
export async function spend(args: {
  userId: string;
  points: number;
  reason: LedgerReason;
  sourceType: string;
  sourceId: string;
  meta?: any;
}): Promise<{ applied: boolean; balance: KPointsBalance }> {
  const points = Math.floor(args.points);
  if (points <= 0) return { applied: false, balance: await getBalance(args.userId) };
  return applyEntry({
    userId: args.userId,
    delta: -points,
    reason: args.reason,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    status: "settled",
    meta: args.meta ?? null,
  });
}

// Admin manual grant (+) or deduct (-). Each call is a distinct ledger row.
export async function adminAdjust(args: {
  userId: string;
  points: number; // may be negative
  actorId: string | null;
  note?: string | null;
}): Promise<KPointsBalance> {
  const points = Math.trunc(args.points);
  if (points === 0) throw new KPointsError("BAD_DELTA", "points must be non-zero");
  const settings = await getKPointsSettings();
  const expiresAt =
    points > 0 && settings.pointsExpiryDays > 0
      ? new Date(Date.now() + settings.pointsExpiryDays * 24 * 60 * 60 * 1000)
      : null;
  const { balance } = await applyEntry({
    userId: args.userId,
    delta: points,
    reason: "admin_grant",
    sourceType: "admin",
    sourceId: randomUUID(),
    expiresAt,
    meta: { actorId: args.actorId ?? null, note: args.note ?? null },
  });
  return balance;
}

// Points earned for a monetary spend under an earn rule. INR-canonical:
// value(base ccy) via the INR points-per-unit, so it stays consistent.
export async function pointsForSpendInr(
  spendInr: number,
  rule: { mode: "percent" | "flat"; value: number },
): Promise<number> {
  if (rule.mode === "flat") return Math.floor(rule.value);
  if (spendInr <= 0 || rule.value <= 0) return 0;
  const ppu = await getPointsPerUnit("INR");
  // % of spend value, converted to points at INR's points-per-unit.
  return Math.floor(spendInr * (rule.value / 100) * ppu);
}

// Grant the signup bonus to existing users who never received it. Idempotent
// per user (the signup ledger unique key), so re-running only credits the gap.
// Processes up to `limit` pending users per call and reports the remainder.
export async function backfillSignupCredits(
  limit = 5000,
): Promise<{ credited: number; remaining: number; points: number }> {
  const rule = await getEarnRule("signup");
  const points = Math.floor(rule.value);
  if (!rule.enabled || points <= 0) return { credited: 0, remaining: 0, points: 0 };

  const alreadyRows = await prisma.kPointsLedger.findMany({
    where: { reason: "signup" },
    select: { userId: true },
  });
  const already = new Set(alreadyRows.map((r) => r.userId));

  const users = await prisma.user.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  const pending = users.filter((u) => !already.has(u.id));
  const batch = pending.slice(0, limit);

  let credited = 0;
  for (const u of batch) {
    const res = await earn({
      userId: u.id,
      points,
      reason: "signup",
      sourceType: "user",
      sourceId: u.id,
    });
    if (res.applied) credited += 1;
  }
  return { credited, remaining: pending.length - batch.length, points };
}

// ─── Redemption (spend at checkout): reserve → settle | release ─────

// Quote how many points a user may redeem on an order and their money value.
// INR-canonical order math; per-currency point value honored via buyer rate.
// `payableInr` is the REDEEMABLE base = product cost only (subtotal − promo
// discount). Shipping is deliberately excluded so it is always paid in full.
export async function computeRedeemQuote(args: {
  userId: string | null;
  requestedPoints: number;
  payableInr: number; // product cost (subtotal − promo discount), INR — excl. shipping
  buyerCurrency: string;
  fxRate: number; // rate_from_inr(buyerCurrency); 1 for INR
}): Promise<{
  balance: number;
  pointsPerUnit: number;
  capPercent: number;
  maxPoints: number;
  appliedPoints: number;
  valueInr: number;
  valueBuyer: number;
}> {
  const settings = await getKPointsSettings();
  const ppu = await getPointsPerUnit(args.buyerCurrency);
  const fx = args.fxRate > 0 ? args.fxRate : 1;
  const balance = args.userId ? (await getBalance(args.userId)).available : 0;

  const zero = {
    balance,
    pointsPerUnit: ppu,
    capPercent: settings.redeemCapPercent,
    maxPoints: 0,
    appliedPoints: 0,
    valueInr: 0,
    valueBuyer: 0,
  };
  // Guard misconfiguration (non-positive/NaN rate or cap) and nothing to redeem.
  if (
    !Number.isFinite(ppu) ||
    ppu <= 0 ||
    settings.redeemCapPercent <= 0 ||
    args.payableInr <= 0 ||
    balance <= 0
  ) {
    return zero;
  }

  const maxValueInr = Math.max(0, args.payableInr) * (settings.redeemCapPercent / 100);
  const maxPointsByCap = Math.floor(maxValueInr * fx * ppu);
  let maxPoints = Math.max(0, Math.min(balance, maxPointsByCap));
  // If the achievable max can't reach the minimum-redeemable, redemption isn't
  // possible — surface 0 so the checkout widget hides instead of teasing it.
  if (maxPoints < settings.redeemMinPoints) return zero;

  let appliedPoints = Math.max(0, Math.min(Math.floor(args.requestedPoints || 0), maxPoints));
  if (appliedPoints > 0 && appliedPoints < settings.redeemMinPoints) appliedPoints = 0;

  const valueBuyer = appliedPoints / ppu;
  const valueInr = roundMoney(valueBuyer / fx);
  return {
    balance,
    pointsPerUnit: ppu,
    capPercent: settings.redeemCapPercent,
    maxPoints,
    appliedPoints,
    valueInr,
    valueBuyer: roundMoney(valueBuyer),
  };
}

async function findRedeemRow(orderId: string) {
  return prisma.kPointsLedger.findFirst({
    where: { sourceType: "order", sourceId: orderId, reason: "redeem" },
  });
}

// Hold points for a pending order. Idempotent per order id.
export async function reserve(args: {
  userId: string;
  points: number;
  orderId: string;
}): Promise<{ ok: boolean; balance: KPointsBalance }> {
  const points = Math.floor(args.points);
  if (points <= 0) return { ok: true, balance: await getBalance(args.userId) };
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.kPointsLedger.create({
        data: {
          id: randomUUID(),
          userId: args.userId,
          delta: -points,
          reason: "redeem",
          sourceType: "order",
          sourceId: args.orderId,
          status: "reserved",
          expiresAt,
        },
      });
      // Conditional move available → reserved; fails atomically if short.
      const res = await tx.kPointsBalance.updateMany({
        where: { userId: args.userId, available: { gte: points } },
        data: {
          available: { decrement: points },
          reserved: { increment: points },
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw new KPointsError("INSUFFICIENT_POINTS");
    });
    return { ok: true, balance: await getBalance(args.userId) };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: true, balance: await getBalance(args.userId) }; // already reserved
    throw e;
  }
}

// Finalize a reservation after successful payment. `pointsQty` is the order's
// stored redeemed quantity (used as a fallback if the reservation expired).
export async function settle(orderId: string, pointsQty: number): Promise<void> {
  const row = await findRedeemRow(orderId);
  if (row && row.status === "settled") return; // idempotent

  if (row && row.status === "reserved") {
    const pts = Math.abs(row.delta);
    await prisma.$transaction(async (tx) => {
      // Status-guarded so two concurrent settles can't both move the balance.
      const flip = await tx.kPointsLedger.updateMany({
        where: { id: row.id, status: "reserved" },
        data: { status: "settled", expiresAt: null },
      });
      if (flip.count === 0) return; // already settled by a concurrent call
      await tx.kPointsBalance.update({
        where: { userId: row.userId },
        data: {
          reserved: { decrement: pts },
          lifetimeSpent: { increment: pts },
          version: { increment: 1 },
        },
      });
    });
    return;
  }

  // Reservation missing or already released (e.g. expired before payment) —
  // the customer was still charged the reduced total, so spend the points now
  // from available (best-effort; won't block a paid order).
  if (!row && pointsQty > 0) {
    try {
      const settings = await getKPointsSettings();
      await applyEntry({
        userId: (await prisma.orders.findUnique({ where: { id: orderId }, select: { user_id: true } }))!.user_id,
        delta: -Math.floor(pointsQty),
        reason: "redeem",
        sourceType: "order_settle",
        sourceId: orderId,
        status: "settled",
        meta: { note: "settle without live reservation", expiryDays: settings.pointsExpiryDays },
      });
    } catch (e) {
      console.error("[k-points] settle fallback failed", orderId, e);
    }
  }
}

// Return reserved points to available (payment abandoned/failed). Idempotent.
export async function release(orderId: string): Promise<void> {
  const row = await findRedeemRow(orderId);
  if (!row || row.status !== "reserved") return;
  const pts = Math.abs(row.delta);
  await prisma.$transaction(async (tx) => {
    // Status-guarded so a concurrent settle/release can't double-move funds.
    const flip = await tx.kPointsLedger.updateMany({
      where: { id: row.id, status: "reserved" },
      data: { status: "reversed", expiresAt: null },
    });
    if (flip.count === 0) return;
    await tx.kPointsBalance.update({
      where: { userId: row.userId },
      data: {
        reserved: { decrement: pts },
        available: { increment: pts },
        version: { increment: 1 },
      },
    });
  });
}

// Sweep expired reservations whose order never got paid (cron/lazy).
export async function releaseExpiredReservations(limit = 200): Promise<number> {
  const rows = await prisma.kPointsLedger.findMany({
    where: { reason: "redeem", status: "reserved", expiresAt: { lt: new Date() } },
    take: limit,
  });
  let released = 0;
  for (const row of rows) {
    const order = await prisma.orders.findUnique({
      where: { id: row.sourceId },
      select: { status: true },
    });
    if (order?.status === "paid") continue; // paid but unsettled → leave for reconciliation
    await release(row.sourceId);
    released += 1;
  }
  return released;
}

// Expire earned points past their expiry date, oldest-first (FIFO). Deducts at
// most the currently-available balance per lot so it can never go negative;
// idempotent per lot. Best run from a daily cron.
export async function expirePoints(
  limit = 500,
): Promise<{ lots: number; pointsExpired: number }> {
  const lots = await prisma.kPointsLedger.findMany({
    where: { status: "available", delta: { gt: 0 }, expiresAt: { lt: new Date() } },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  let processed = 0;
  let pointsExpired = 0;
  for (const lot of lots) {
    await prisma.$transaction(async (tx) => {
      // Mark the lot expired regardless (it is past its date), status-guarded so
      // it is processed once.
      const claim = await tx.kPointsLedger.updateMany({
        where: { id: lot.id, status: "available" },
        data: { status: "expired" },
      });
      if (claim.count === 0) return; // already processed

      const bal = await tx.kPointsBalance.findUnique({ where: { userId: lot.userId } });
      const amt = Math.min(lot.delta, bal?.available ?? 0);
      if (amt <= 0) return;

      // Conditional decrement — if a concurrent spend already consumed these
      // points, skip the deduction (they're gone) instead of going negative.
      const res = await tx.kPointsBalance.updateMany({
        where: { userId: lot.userId, available: { gte: amt } },
        data: { available: { decrement: amt }, version: { increment: 1 } },
      });
      if (res.count === 0) return;

      await tx.kPointsLedger.create({
        data: {
          id: randomUUID(),
          userId: lot.userId,
          delta: -amt,
          reason: "expiry",
          sourceType: "lot",
          sourceId: lot.id,
          status: "expired",
        },
      });
      pointsExpired += amt;
    });
    processed += 1;
  }
  return { lots: processed, pointsExpired };
}

export type LedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  meta: any;
};

export async function getLedger(userId: string, take = 50, skip = 0): Promise<LedgerEntry[]> {
  const rows = await prisma.kPointsLedger.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });
  return rows.map((r) => ({
    id: r.id,
    delta: r.delta,
    reason: r.reason,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    meta: r.meta,
  }));
}
