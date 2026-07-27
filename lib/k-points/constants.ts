// K-Points shared constants + defaults. Client-safe (no DB / server-only).

export const K_POINTS_NAME = "K-Points";

// Earn actions the admin can configure (k_points_rules rows).
export const EARN_ACTIONS = ["purchase", "signup", "review", "referral"] as const;
export type EarnAction = (typeof EARN_ACTIONS)[number];

export type LedgerReason =
  | "purchase"
  | "signup"
  | "review"
  | "referral"
  | "redeem"
  | "buy"
  | "admin_grant"
  | "skin_access"
  | "expiry"
  | "reversal";

// Defaults used when the singleton settings row is missing/unreadable.
export const DEFAULT_K_POINTS_SETTINGS = {
  baseCurrency: "USD",
  basePointsPerUnit: 500, // 500 K-Points ≡ 1 unit of base currency
  redeemCapPercent: 20,
  redeemMinPoints: 0,
  pointsExpiryDays: 365, // 0 = never
  skinAnalyzerCostPoints: 0,
  earnOnNet: true,
};

export type KPointsSettingsValue = typeof DEFAULT_K_POINTS_SETTINGS;

export type EarnRule = {
  actionKey: EarnAction;
  mode: "percent" | "flat";
  value: number; // percent (0-100) or flat points
  enabled: boolean;
  oneTime: boolean;
};
