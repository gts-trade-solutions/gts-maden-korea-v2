export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Called by /admin/cms/product-video after any save / delete / toggle /
// reorder so newly-added (or hidden) home product videos appear on
// the public home page right away. Without this the home section's
// `export const revalidate = 60` caches the previous video set for up
// to a minute and the page's own ISR (30s) reuses the cached HTML.
//
// `revalidatePath('/')` busts both layers — Next re-runs the home
// route on the next request, which re-fetches the video section's
// query directly against Supabase.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  revalidatePath("/");

  return json({ ok: true });
}
