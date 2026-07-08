// lib/instagram.ts
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

const INSTAGRAM_OWNER_ID = process.env.INSTAGRAM_OWNER_ID!;

export async function getActiveInstagramAccount() {
  const row = await prisma.instagram_accounts.findFirst({
    where: { owner_id: INSTAGRAM_OWNER_ID, is_active: true },
    orderBy: { created_at: "desc" },
  });

  if (!row) return null;
  return jsonSafe(row) as {
    ig_business_account_id: string;
    username: string | null;
    access_token: string;
  };
}
