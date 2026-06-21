export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

// Called by the banner admin after any save/delete/toggle so the
// home page reflects the change immediately instead of waiting for
// the 30s ISR window. Tag invalidation drops the unstable_cache
// entry behind getBanners; revalidatePath('/') refreshes the rendered
// home route.
export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  revalidateTag("banners");
  revalidatePath("/");

  return json({ ok: true });
}
