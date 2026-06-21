export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { mirrorTableToMysql } from "@/lib/data/mirror";

// Generic admin/CMS write broker. Replaces the browser-direct Supabase writes
// that are silently RLS-denied under NextAuth (no session). The write runs on
// the SERVICE-ROLE client (bypasses RLS) and then mirrorTableToMysql syncs MySQL,
// so admin CRUD persists in both DBs. Admin-gated + table-allowlisted.
//
// Body: { table, op: "insert"|"update"|"upsert"|"delete",
//         data?, match?: {col:val,...}, onConflict?: "col", mirrorScope?: string }
// Returns: { ok, row? }  (row = the inserted/updated row, when available)
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Allowlisted admin/CMS tables + the column that scopes the MySQL re-sync.
// (no scope = full-table mirror, which is fine for these small CMS tables.)
const WRITABLE: Record<string, { scope?: string }> = {
  home_banners: {},
  brands: {},
  categories: {},
  home_product_videos: {},
  home_influencer_videos: {},
  home_product_video_products: { scope: "video_id" },
  home_influencer_video_products: { scope: "video_id" },
  product_story_blocks: { scope: "product_id" },
  products: { scope: "id" },
  product_images: { scope: "product_id" },
  product_videos: { scope: "product_id" },
  product_country_prices: { scope: "product_id" },
  k_partnership_videos: {},
  store_settings: {},
  // Admin sections that were doing browser-anon Supabase writes (RLS-denied
  // under NextAuth). Routed here so they run on the service-role client. Tables
  // not in MIRRORABLE simply skip the (best-effort) MySQL mirror — they aren't
  // MySQL-read; orders/order_items ARE mirrored.
  orders: { scope: "id" },
  order_items: { scope: "order_id" },
  payments: {},
  invoices: {},
  invoice_items: {},
  invoice_addresses: {},
  invoice_payments: {},
  dtdc_shipments: {},
  whatsapp_contacts: {},
  whatsapp_campaigns: {},
  whatsapp_campaign_messages: {},
  whatsapp_templates: {},
  international_orders: {},
  currency_rates: {},
};

function applyMatch(q: any, match: any) {
  if (match && typeof match === "object") for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  return q;
}

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({} as any));
  const table = String(body?.table || "");
  const op = String(body?.op || "");
  const cfg = WRITABLE[table];
  if (!cfg) return json({ ok: false, error: "TABLE_NOT_WRITABLE", table }, 400);

  const sb = admin();
  try {
    let row: any = null;
    const isArray = Array.isArray(body.data); // bulk insert/upsert -> don't maybeSingle
    if (op === "insert") {
      const q = sb.from(table).insert(body.data).select();
      const r = isArray ? await q : await q.maybeSingle();
      if (r.error) return json({ ok: false, error: r.error.message }, 500);
      row = r.data;
    } else if (op === "upsert") {
      const q = sb
        .from(table)
        .upsert(body.data, body.onConflict ? { onConflict: body.onConflict } : undefined)
        .select();
      const r = isArray ? await q : await q.maybeSingle();
      if (r.error) return json({ ok: false, error: r.error.message }, 500);
      row = r.data;
    } else if (op === "update") {
      const r = await applyMatch(sb.from(table).update(body.data), body.match).select().maybeSingle();
      if (r.error) return json({ ok: false, error: r.error.message }, 500);
      row = r.data;
    } else if (op === "delete") {
      const r = await applyMatch(sb.from(table).delete(), body.match);
      if (r.error) return json({ ok: false, error: r.error.message }, 500);
    } else {
      return json({ ok: false, error: "BAD_OP" }, 400);
    }

    // Sync MySQL. Scoped tables need a scope value (from the row, the match, or
    // an explicit mirrorScope); full-table tables re-sync wholesale.
    if (cfg.scope) {
      const scopeVal = body?.mirrorScope ?? row?.[cfg.scope] ?? body?.match?.[cfg.scope];
      if (scopeVal != null) await mirrorTableToMysql(table, String(scopeVal)).catch(() => {});
    } else {
      await mirrorTableToMysql(table).catch(() => {});
    }

    return json({ ok: true, row });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WRITE_FAILED" }, 500);
  }
}
