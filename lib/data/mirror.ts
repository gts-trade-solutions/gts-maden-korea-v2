import "server-only";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db/prisma";

// Generic dual-write mirror: re-sync a table (or a product-scoped slice) from
// Supabase (authoritative) into MySQL (the storefront read source). Column-safe
// + FK-safe, the same approach as migration/etl/data-copy.mjs. Used by the
// /api/admin/mysql-mirror endpoint (for browser-direct CMS writes) and directly
// by server routes that write these tables. Server-only.
//
// scope present -> partial replace WHERE <scope> = scopeVal; absent -> full table.
export const MIRRORABLE: Record<string, { scope?: string }> = {
  orders: { scope: "id" },
  order_items: { scope: "order_id" },
  products: { scope: "id" },
  product_images: { scope: "product_id" },
  product_videos: { scope: "product_id" },
  product_country_prices: { scope: "product_id" },
  product_story_blocks: { scope: "product_id" },
  product_translations: { scope: "product_id" },
  brand_translations: { scope: "brand_id" },
  category_translations: { scope: "category_id" },
  brands: {},
  categories: {},
  home_banners: {},
  home_product_videos: {},
  home_influencer_videos: {},
  home_product_video_products: {},
  home_influencer_video_products: {},
  k_partnership_videos: {},
  store_settings: {},
};

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const coerce = (v: any, col: string) => {
  if (v == null) return null;
  if (typeof v === "string" && /(_at|_date|_until|_starts|_ends)$/.test(col)) return new Date(v);
  return v;
};

export async function mirrorTableToMysql(
  table: string,
  scopeVal?: string
): Promise<{ ok: boolean; synced?: number; error?: string; status?: number }> {
  const cfg = MIRRORABLE[table];
  if (!cfg) return { ok: false, error: "table not mirrorable", status: 400 };
  if (cfg.scope && !scopeVal) return { ok: false, error: `${cfg.scope} required`, status: 400 };

  try {
    const colRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
      table
    );
    const cols = colRows.map((r) => r.c ?? (Object.values(r)[0] as string)).filter(Boolean);
    if (!cols.length) return { ok: false, error: "no MySQL table", status: 400 };

    const sb = admin();
    let q = sb.from(table).select(cols.join(","));
    if (cfg.scope) q = q.eq(cfg.scope, scopeVal);
    const { data: rows, error: sErr } = await q;
    if (sErr) return { ok: false, error: sErr.message, status: 500 };

    const mapped = (rows ?? []).map((row: any) => {
      const o: Record<string, any> = {};
      for (const c of cols) o[c] = coerce(row[c], c);
      return o;
    });

    if (!(prisma as any)[table]?.deleteMany) return { ok: false, error: "no prisma model", status: 500 };

    await prisma.$transaction(async (tx) => {
      const m = (tx as any)[table];
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
      if (cfg.scope) await m.deleteMany({ where: { [cfg.scope]: scopeVal } });
      else await m.deleteMany({});
      if (mapped.length) await m.createMany({ data: mapped });
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
    });

    return { ok: true, synced: mapped.length };
  } catch (e: any) {
    console.error(`[mirror] ${table} failed:`, e?.message || e);
    return { ok: false, error: e?.message || "mirror failed", status: 500 };
  }
}
