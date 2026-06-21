export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { mirrorTableToMysql } from "@/lib/data/mirror";
import { jsonSafe } from "@/lib/db/serialize";

// Admin product list CRUD, MySQL-authoritative read + dual-write.
//   GET  -> products + brand/category/vendor lookups, READ FROM MYSQL (Prisma).
//   POST -> { op, id?, ids?, data? } mutations. The write goes to Supabase via the
//           SERVICE-ROLE client (bypasses RLS — the old browser anon write was
//           silently RLS-denied under NextAuth), then mirrorTableToMysql syncs
//           MySQL. Dual-write keeps both DBs consistent until the Supabase
//           decommission (see migration/SUPABASE_DECOMMISSION.md). Admin-gated.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  try {
    const [products, brands, categories, vendors] = await Promise.all([
      prisma.products.findMany({
        select: {
          id: true, slug: true, name: true, sku: true, price: true, currency: true,
          is_published: true, stock_qty: true, brand_id: true, category_id: true,
          vendor_id: true, is_featured: true, featured_rank: true, is_trending: true, new_until: true,
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.brands.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
      prisma.categories.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
      prisma.vendors.findMany({ select: { id: true, display_name: true }, orderBy: { display_name: "asc" } }),
    ]);
    return json({ ok: true, products: jsonSafe(products), brands: jsonSafe(brands), categories: jsonSafe(categories), vendors: jsonSafe(vendors) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
}

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const body = await req.json().catch(() => ({} as any));
  const op = String(body?.op || "");
  const sb = admin();

  try {
    if (op === "updateFields") {
      const id = String(body?.id || "");
      const data = body?.data ?? {};
      if (!id) return json({ ok: false, error: "MISSING_ID" }, 400);
      const patch: Record<string, any> = {};
      if ("is_featured" in data) patch.is_featured = !!data.is_featured;
      if ("featured_rank" in data)
        patch.featured_rank = data.featured_rank == null || data.featured_rank === "" ? null : Number(data.featured_rank);
      if ("is_trending" in data) patch.is_trending = !!data.is_trending;
      if ("new_until" in data) patch.new_until = data.new_until ? new Date(data.new_until).toISOString() : null;
      const { error: e } = await sb.from("products").update(patch).eq("id", id);
      if (e) return json({ ok: false, error: e.message }, 500);
      await mirrorTableToMysql("products", id).catch(() => {});
      return json({ ok: true });
    }

    if (op === "delete") {
      const id = String(body?.id || "");
      if (!id) return json({ ok: false, error: "MISSING_ID" }, 400);
      await sb.from("product_images").delete().eq("product_id", id);
      await sb.from("product_videos").delete().eq("product_id", id);
      const { error: e } = await sb.from("products").delete().eq("id", id);
      if (e) return json({ ok: false, error: e.message }, 500);
      // Scoped re-sync removes the now-deleted rows from MySQL.
      await mirrorTableToMysql("product_images", id).catch(() => {});
      await mirrorTableToMysql("product_videos", id).catch(() => {});
      await mirrorTableToMysql("products", id).catch(() => {});
      return json({ ok: true });
    }

    if (op === "bulkPublish") {
      const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
      const publish = !!body?.publish;
      if (!ids.length) return json({ ok: false, error: "NO_IDS" }, 400);
      const { error: e } = await sb.from("products").update({ is_published: publish }).in("id", ids);
      if (e) return json({ ok: false, error: e.message }, 500);
      for (const id of ids) await mirrorTableToMysql("products", id).catch(() => {});
      return json({ ok: true });
    }

    return json({ ok: false, error: "BAD_OP" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WRITE_FAILED" }, 500);
  }
}
