import "server-only";
import { prisma } from "@/lib/db/prisma";

// Mirror the influencer commission ledger writes that razorpay/verify makes
// (order_attributions row + promo_codes.uses increment) into MySQL, so once the
// influencer dashboards read from MySQL their earnings/usage numbers are correct.
// Supabase stays authoritative; both are best-effort callers.

const OA_FIELDS =
  "order_id, influencer_id, referral_id, promo_code_id, attributed_by, discount_percent, " +
  "commission_percent, commission_amount, currency, status, created_at, user_discount_total, commission_total";


