import { createClient } from "@supabase/supabase-js";

export const MEMBERSHIP_PLAN_CODE = "k_plus";
export const MEMBERSHIP_PLAN_NAME = "K-Plus";
export const MEMBERSHIP_PRICE = 199;
export const MEMBERSHIP_DURATION_DAYS = 90;

/**
 * Hard-coded fallbacks. Live values are stored in `public.store_settings`
 * and read via `lib/storeSettings.ts` (server) or `useShippingConfig`
 * (client). These constants are only used when the DB is unreachable
 * or the row is missing.
 */
export const DELIVERY_THRESHOLD = 2000;
export const DEFAULT_SHIPPING_FEE = 149;

export type ShippingConfig = {
  deliveryThreshold: number;
  defaultShippingFee: number;
};

export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  deliveryThreshold: DELIVERY_THRESHOLD,
  defaultShippingFee: DEFAULT_SHIPPING_FEE,
};

export type MembershipRow = {
  id?: string;
  user_id?: string;
  plan_code?: string;
  plan_name?: string;
  amount?: number;
  duration_days?: number;
  status: string;
  starts_at?: string;
  ends_at: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true } }
);

export function hasActiveMembership(
  membership?: Pick<MembershipRow, "status" | "ends_at"> | null
) {
  if (!membership) return false;

  return (
    membership.status === "active" &&
    new Date(membership.ends_at).getTime() > Date.now()
  );
}

export function computeShippingFee(
  subtotal: number,
  membership?: Pick<MembershipRow, "status" | "ends_at"> | null,
  config: ShippingConfig = DEFAULT_SHIPPING_CONFIG
) {
  if (hasActiveMembership(membership)) return 0;
  if (subtotal >= config.deliveryThreshold) return 0;
  return config.defaultShippingFee;
}

/**
 * Returns a discriminated kind describing the current shipping state.
 * The caller (cart / checkout) is responsible for translating it via
 * `useTranslations()` — keeping this function locale-agnostic so it
 * works in server contexts too.
 */
export type ShippingMessage =
  | { kind: "membership" }
  | { kind: "free" }
  | { kind: "threshold"; threshold: number };

export function shippingMessage(
  subtotal: number,
  membership?: Pick<MembershipRow, "status" | "ends_at"> | null,
  config: ShippingConfig = DEFAULT_SHIPPING_CONFIG
): ShippingMessage {
  if (hasActiveMembership(membership)) return { kind: "membership" };
  if (subtotal >= config.deliveryThreshold) return { kind: "free" };
  return { kind: "threshold", threshold: config.deliveryThreshold };
}

export async function syncMembershipStatus(userId: string) {
  const res = await fetch("/api/membership/sync-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || "Failed to sync membership status");
  }

  return data;
}

export async function getActiveMembership(userId: string) {
  await syncMembershipStatus(userId);

  const { data, error } = await supabase
    .from("user_memberships")
    .select("id, user_id, plan_code, plan_name, amount, duration_days, status, starts_at, ends_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}