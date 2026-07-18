// lib/auth/emailVerification.ts
//
// Server-side helpers for the email-verification system. Three buckets:
//
//   1. Token utilities — generate / hash / persist / look up tokens stored
//      in `public.email_verification_tokens`.
//   2. Config reader — pulls the global grace / lockout day counts from
//      `store_settings` with sensible defaults.
//   3. Verification status — `getEmailVerificationStatus(userId)` returns
//      a single object every gate / banner uses to decide what to show
//      or block. Includes the resolved deadline (admin override > computed).
//
// All read/writes go through the service-role client because tokens have
// no RLS policies (server-only access by design).

import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";

// 24-hour token expiry. Long enough that someone checking email later in
// the day still has a valid link; short enough that abandoned links don't
// stay live forever.
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Defaults if `store_settings` isn't reachable or columns are NULL. Match
// the migration defaults exactly so behavior is consistent if the row is
// missing.
const DEFAULT_GRACE_DAYS = 7;
const DEFAULT_LOCKOUT_DAYS = 30;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export type EmailVerificationConfig = {
  graceDays: number;
  lockoutDays: number;
};

export async function getEmailVerificationConfig(): Promise<EmailVerificationConfig> {
  const data = await prisma.store_settings.findFirst({
    select: {
      email_verification_grace_days: true,
      email_verification_lockout_days: true,
    },
  });
  return {
    graceDays:
      Number(data?.email_verification_grace_days) > 0
        ? Number(data!.email_verification_grace_days)
        : DEFAULT_GRACE_DAYS,
    lockoutDays:
      Number(data?.email_verification_lockout_days) > 0
        ? Number(data!.email_verification_lockout_days)
        : DEFAULT_LOCKOUT_DAYS,
  };
}

export type EmailVerificationStage =
  // role is admin / vendor / super_admin OR email_verified_at is set
  | "verified"
  // unverified, within grace period — show subtle banner
  | "soft"
  // past grace, before lockout — show prominent banner with countdown
  | "warning"
  // past lockout — soft-lock modal blocks non-browsing actions
  | "locked";

export type EmailVerificationStatus = {
  userId: string;
  verified: boolean;
  stage: EmailVerificationStage;
  /** ISO string. The moment we started counting (signup or rollout). */
  graceStartsAt: string | null;
  /** ISO string. Absolute lockout deadline, after override is applied. */
  lockoutAt: string | null;
  /** Days remaining until lockout (negative if past lockout). null if verified. */
  daysUntilLockout: number | null;
};

/**
 * Resolves the verification status for a user. Reads:
 *   - profiles.role, email_verified_at, email_verification_grace_starts_at,
 *     email_verification_deadline_override
 *   - global config from store_settings
 *
 * Roles 'admin', 'super_admin', 'vendor' are always considered verified
 * regardless of email_verified_at — staff bypass.
 */
/**
 * Profile read for verification. The authoritative user/profile lives in
 * MySQL (esp. OAuth users), so read it there — otherwise the gate can't see
 * them and they drift into the grace→lockout countdown despite a verified
 * email. Returns the row shape (ISO strings / nulls) the caller expects.
 */
async function readVerificationProfile(userId: string): Promise<{
  id: string;
  role: string | null;
  email_verified_at: string | null;
  email_verification_grace_starts_at: string | null;
  email_verification_deadline_override: string | null;
} | null> {
  const p = await prisma.profiles.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      email_verified_at: true,
      email_verification_grace_starts_at: true,
      email_verification_deadline_override: true,
    },
  });
  if (!p) return null;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: p.id,
    role: (p.role as string) ?? null,
    email_verified_at: iso(p.email_verified_at as Date | null),
    email_verification_grace_starts_at: iso(p.email_verification_grace_starts_at as Date | null),
    email_verification_deadline_override: iso(p.email_verification_deadline_override as Date | null),
  };
}

export async function getEmailVerificationStatus(
  userId: string
): Promise<EmailVerificationStatus> {
  const [profile, config] = await Promise.all([
    readVerificationProfile(userId),
    getEmailVerificationConfig(),
  ]);

  // Staff bypass — role check first because their flags may be null on
  // legacy accounts and we don't want them in any "unverified" bucket.
  const role = profile?.role ?? null;
  if (role === "admin" || role === "super_admin" || role === "vendor") {
    return {
      userId,
      verified: true,
      stage: "verified",
      graceStartsAt: profile?.email_verification_grace_starts_at ?? null,
      lockoutAt: null,
      daysUntilLockout: null,
    };
  }

  if (profile?.email_verified_at) {
    return {
      userId,
      verified: true,
      stage: "verified",
      graceStartsAt: profile.email_verification_grace_starts_at ?? null,
      lockoutAt: null,
      daysUntilLockout: null,
    };
  }

  // Unverified. Compute deadline using override-or-default.
  const graceStartIso = profile?.email_verification_grace_starts_at ?? null;
  const graceStart = graceStartIso ? new Date(graceStartIso) : new Date();

  const computedLockout = new Date(
    graceStart.getTime() + config.lockoutDays * 24 * 60 * 60 * 1000
  );
  const lockoutDate = profile?.email_verification_deadline_override
    ? new Date(profile.email_verification_deadline_override as string)
    : computedLockout;

  const warningStart = new Date(
    graceStart.getTime() + config.graceDays * 24 * 60 * 60 * 1000
  );

  const now = Date.now();
  const stage: EmailVerificationStage =
    now >= lockoutDate.getTime()
      ? "locked"
      : now >= warningStart.getTime()
        ? "warning"
        : "soft";

  return {
    userId,
    verified: false,
    stage,
    graceStartsAt: graceStartIso,
    lockoutAt: lockoutDate.toISOString(),
    daysUntilLockout: Math.ceil(
      (lockoutDate.getTime() - now) / (24 * 60 * 60 * 1000)
    ),
  };
}

/**
 * Hard gate used inside trust-required APIs (checkout, reviews,
 * K-Partnership, etc.). Returns null if the user may proceed, otherwise
 * an object describing the block reason — caller turns it into a 403.
 *
 * Graduated by design: during the grace ("soft") and countdown ("warning")
 * stages the user may still act — the banners nudge them — and only the
 * "locked" stage (past the lockout deadline) hard-blocks. Blocking every
 * unverified user here made verification effectively mandatory from minute
 * one and broke checkout during the grace window.
 */
export type EmailVerificationBlock = {
  reason: "unverified" | "locked";
  stage: EmailVerificationStage;
  message: string;
};

export async function requireEmailVerified(
  userId: string
): Promise<EmailVerificationBlock | null> {
  const status = await getEmailVerificationStatus(userId);
  if (status.verified) return null;
  if (status.stage !== "locked") return null;
  return {
    reason: "locked",
    stage: status.stage,
    message:
      "Your verification window has ended. Please verify your email before continuing.",
  };
}

/**
 * Issue a fresh verification token for the given user + email pair.
 * Invalidates any prior unused tokens so only the latest link is valid
 * — protects against confused-recipient races where the user clicks an
 * older mail.
 *
 * Returns the raw (unhashed) token — caller embeds it into the email URL.
 * The hash lives in the DB.
 */
export async function issueVerificationToken(opts: {
  userId: string;
  email: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  // Invalidate older outstanding tokens for this user. The next click on
  // any older link gets "expired" instead of working.
  await prisma.email_verification_tokens.updateMany({
    where: { user_id: opts.userId, used_at: null },
    data: { used_at: now },
  });

  await prisma.email_verification_tokens.create({
    data: {
      id: crypto.randomUUID(),
      user_id: opts.userId,
      email: opts.email.toLowerCase(),
      token_hash: tokenHash,
      expires_at: expiresAt,
    },
  });

  return { token, expiresAt };
}

export type VerifyTokenResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "not_found" | "expired" | "used" };

/**
 * Look up + consume a raw token. Returns the owning user_id on success.
 * Marks the token used so re-clicking the link doesn't re-fire any side
 * effects on the caller's side.
 */
export async function consumeVerificationToken(
  rawToken: string
): Promise<VerifyTokenResult> {
  const tokenHash = hashToken(rawToken);

  const row = await prisma.email_verification_tokens.findFirst({
    where: { token_hash: tokenHash },
    select: { id: true, user_id: true, email: true, expires_at: true, used_at: true },
  });

  if (!row) return { ok: false, reason: "not_found" };
  if (row.used_at) return { ok: false, reason: "used" };
  if (new Date(row.expires_at).getTime() < Date.now())
    return { ok: false, reason: "expired" };

  await prisma.email_verification_tokens.update({
    where: { id: row.id },
    data: { used_at: new Date() },
  });

  return {
    ok: true,
    userId: row.user_id as string,
    email: row.email as string,
  };
}

/**
 * Mark a user as verified. Idempotent — running twice is harmless.
 */
export async function markUserVerified(userId: string): Promise<void> {
  // updateMany tolerates a missing profiles row (Prisma update would throw
  // P2025). The NextAuth verification gate reads email_verified_at from here.
  await prisma.profiles.updateMany({
    where: { id: userId },
    data: { email_verified_at: new Date() },
  });
}

/**
 * Resend rate limit — refuse if a token was issued for this user in the
 * last `windowSeconds`. Default 60s — generous enough that the user can
 * always click resend immediately after pressing it, strict enough that
 * an attacker can't pump SES bills.
 */
export async function canResendVerification(
  userId: string,
  windowSeconds = 60
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSeconds * 1000);
  const count = await prisma.email_verification_tokens.count({
    where: { user_id: userId, created_at: { gte: cutoff } },
  });
  return count === 0;
}
