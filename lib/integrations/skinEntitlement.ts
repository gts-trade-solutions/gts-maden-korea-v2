import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Skin-analysis entitlement engine (MadeNKorea = authority).
 *
 * One `skin_entitlements` row per granted analysis; the row id IS the handoff
 * token's grant_id. Lifecycle:
 *
 *   available ──(reserve at Start)──► reserved ──(consume on success)──► consumed
 *                       ▲                   │
 *                       └──(release: TTL / failure)──┘   free scan preserved
 *
 * A brand-new user is lazily seeded with ONE free (`source:"free"`) available
 * scan on first read/start. Expired reservations auto-release on read.
 */

export const RESERVATION_TTL_MS = 30 * 60 * 1000; // 30 min ≫ max analysis time

export type SkinAccessState =
  | { status: "ready"; remaining: number } // has an available scan
  | { status: "reserved"; grantId: string } // an active reservation exists
  | { status: "none" }; // out of scans → must request access

/**
 * Release reservations whose TTL has passed (lazy expiry — no cron). The scan
 * returns to `available` so an abandoned start isn't lost — important now that
 * a scan can be paid for with K-Points (losing it would burn the user's
 * points). A consumed scan is already `consumed`, so it's untouched.
 */
async function releaseExpired(userId: string): Promise<void> {
  await prisma.skinEntitlement.updateMany({
    where: { userId, state: "reserved", expiresAt: { lt: new Date() } },
    // Keep `reservedAt` so we remember this scan was already started — the UI
    // then shows "Continue" rather than treating it as a fresh scan. Only the
    // TTL (`expiresAt`) is cleared.
    data: { state: "available", expiresAt: null },
  });
}

/**
 * Seed the single free scan the first time we ever see this user — but ONLY
 * while the analyzer is not points-gated. Once the admin sets
 * `skinAnalyzerCostPoints > 0` (see K_POINTS.md), access must be paid with
 * K-Points (or admin-granted), so no free scan is seeded.
 */
async function seedFreeIfNew(userId: string): Promise<void> {
  try {
    const { getKPointsSettings } = await import("@/lib/k-points/config");
    const settings = await getKPointsSettings();
    if (settings.skinAnalyzerCostPoints > 0) return; // points-gated → no free scan
  } catch {
    /* config unreadable → fall back to seeding free (safe default) */
  }
  const everHad = await prisma.skinEntitlement.count({ where: { userId } });
  if (everHad === 0) {
    await prisma.skinEntitlement.create({
      data: { userId, state: "available", source: "free" },
    });
  }
}

export async function getAccessState(userId: string): Promise<SkinAccessState> {
  await releaseExpired(userId);
  // "Open" analysis = actively reserved OR a previously-started scan that
  // lapsed back to available (reservedAt is set). Both should show "Continue".
  const open = await prisma.skinEntitlement.findFirst({
    where: {
      userId,
      OR: [
        { state: "reserved" },
        { state: "available", reservedAt: { not: null } },
      ],
    },
    orderBy: { reservedAt: "desc" },
  });
  if (open) return { status: "reserved", grantId: open.id };

  // Only genuinely fresh (never-started) scans count toward "ready".
  let available = await prisma.skinEntitlement.count({
    where: { userId, state: "available", reservedAt: null },
  });
  if (available === 0) {
    await seedFreeIfNew(userId);
    available = await prisma.skinEntitlement.count({
      where: { userId, state: "available", reservedAt: null },
    });
  }
  if (available > 0) return { status: "ready", remaining: available };
  return { status: "none" };
}

/**
 * Reserve one scan for a handoff. Returns the grant id (entitlement row id) to
 * embed in the token, or null if the user has none left.
 *
 * - Reuses an existing active reservation (double-Start / two-tab safety),
 *   refreshing its TTL.
 * - Claims an available row with a compare-and-set guard so two concurrent
 *   Starts can't both grab the same scan.
 */
export async function reserve(userId: string): Promise<string | null> {
  await releaseExpired(userId);

  const existing = await prisma.skinEntitlement.findFirst({
    where: { userId, state: "reserved" },
    orderBy: { reservedAt: "desc" },
  });
  if (existing) {
    await prisma.skinEntitlement.update({
      where: { id: existing.id },
      data: { expiresAt: new Date(Date.now() + RESERVATION_TTL_MS) },
    });
    return existing.id;
  }

  await seedFreeIfNew(userId);

  const candidate = await prisma.skinEntitlement.findFirst({
    where: { userId, state: "available" },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;

  const now = new Date();
  const claimed = await prisma.skinEntitlement.updateMany({
    where: { id: candidate.id, state: "available" }, // CAS guard against races
    data: {
      state: "reserved",
      reservedAt: now,
      expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
    },
  });
  if (claimed.count === 0) return reserve(userId); // lost a race — retry once
  return candidate.id;
}

/**
 * Consume a reservation on a successful analysis. Idempotent: a retried
 * callback for the SAME analysis returns true without double-spending. Returns
 * false if the grant is unknown/expired/released.
 */
export async function consume(
  grantId: string,
  analysisId: string,
): Promise<boolean> {
  const res = await prisma.skinEntitlement.updateMany({
    where: { id: grantId, state: "reserved" },
    data: { state: "consumed", consumedAt: new Date(), analysisId },
  });
  if (res.count > 0) return true;
  const row = await prisma.skinEntitlement.findUnique({ where: { id: grantId } });
  return !!row && row.state === "consumed" && row.analysisId === analysisId;
}

/** Grant an extra scan (admin approval of a request, or a points purchase). */
export async function grant(
  userId: string,
  source: "granted" | "free" | "points" = "granted",
): Promise<void> {
  await prisma.skinEntitlement.create({
    data: { userId, state: "available", source },
  });
}
