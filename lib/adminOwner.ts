// lib/adminOwner.ts
//
// The owner id that the Meta (Facebook/Instagram) marketing routes scope their
// `instagram_accounts` rows to. Previously exported from lib/adminSupabase.ts;
// extracted here so those routes carry no Supabase import once their queries
// moved to Prisma/MySQL.
export const ADMIN_OWNER_ID =
  process.env.FB_OWNER_ID || process.env.INSTAGRAM_OWNER_ID || null;
