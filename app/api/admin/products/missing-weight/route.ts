export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin-only audit list: published products without a usable
// gross_weight_g. Surfaces the data dependency that shipping math
// (India DTDC + international EMS slabs) has on weight — admin can
// scan, click into the product editor, and backfill.

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  // Service role so RLS doesn't filter rows. We're only returning
  // metadata (id, slug, name, brand) — no PII.
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error: dbErr } = await sb
    .from("products")
    .select("id, slug, name, net_weight_g, gross_weight_g, brands(name)")
    .eq("is_published", true)
    .or("gross_weight_g.is.null,gross_weight_g.lte.0")
    .order("name", { ascending: true });

  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);

  const rows = (data ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brands?.name ?? null,
    net_weight_g: p.net_weight_g,
    gross_weight_g: p.gross_weight_g,
  }));

  return json({ ok: true, total: rows.length, rows });
}
