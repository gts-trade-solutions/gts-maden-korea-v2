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

