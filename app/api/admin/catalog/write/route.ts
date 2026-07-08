export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// Generic admin/CMS write broker — now MySQL-direct (Prisma). Replaces the
// browser-direct Supabase writes that were RLS-denied under NextAuth. The
// route's own admin auth check is the gate; writes are table-allowlisted.
//
// Body: { table, op: "insert"|"update"|"upsert"|"delete",
//         data?, match?: {col:val,...}, onConflict?: "col"|"colA,colB" }
// Returns: { ok, row? }  (row = the inserted/updated row, when available)
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

// Allowlisted admin/CMS tables the broker may write.
const WRITABLE = new Set<string>([
  "home_banners", "brands", "categories", "home_product_videos", "home_influencer_videos",
  "home_product_video_products", "home_influencer_video_products", "product_story_blocks",
  "products", "product_images", "product_videos", "product_country_prices", "k_partnership_videos",
  "store_settings", "orders", "order_items", "payments", "invoices", "invoice_items",
  "invoice_addresses", "invoice_payments", "dtdc_shipments", "whatsapp_contacts", "whatsapp_campaigns",
  "whatsapp_campaign_messages", "whatsapp_templates", "international_orders", "currency_rates",
]);

// Tables whose PK is NOT a generated Char(36) `id` — either a composite PK or a
// natural key (or the single-row int settings). For these we must NOT inject an
// `id`. Every other allowlisted table has an `id CHAR(36)` with no DB default,
// so the browser (which relied on Postgres's default) omits it and we generate
// one here.
const NO_GENERATED_ID = new Set<string>([
  "home_product_video_products", "home_influencer_video_products", // composite (video_id, product_id)
  "k_partnership_videos", // PK = country_code
  "currency_rates", // PK = code
  "store_settings", // PK = int id (single row)
]);

function withId(table: string, row: any) {
  if (row && typeof row === "object" && !Array.isArray(row) && !("id" in row) && !NO_GENERATED_ID.has(table)) {
    return { ...row, id: randomUUID() };
  }
  return row;
}

// Build a Prisma unique-where from an onConflict spec. Single column ->
// { col: value }; compound -> { colA_colB: { colA, colB } } (Prisma's default
// compound-unique input name is the fields joined by "_").
function uniqueWhere(cols: string[], row: any) {
  if (cols.length === 1) return { [cols[0]]: row[cols[0]] };
  const key = cols.join("_");
  const val: Record<string, any> = {};
  for (const c of cols) val[c] = row[c];
  return { [key]: val };
}

export async function POST(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({} as any));
  const table = String(body?.table || "");
  const op = String(body?.op || "");
  if (!WRITABLE.has(table)) return json({ ok: false, error: "TABLE_NOT_WRITABLE", table }, 400);

  const model: any = (prisma as any)[table];
  if (!model) return json({ ok: false, error: "TABLE_NOT_WRITABLE", table }, 400);

  try {
    let row: any = null;
    const isArray = Array.isArray(body.data);

    if (op === "insert") {
      if (isArray) {
        const data = body.data.map((r: any) => withId(table, r));
        await model.createMany({ data });
        row = data;
      } else {
        row = await model.create({ data: withId(table, body.data) });
      }
    } else if (op === "upsert") {
      const rows = isArray ? body.data : [body.data];
      const cols = String(body.onConflict || "id").split(",").map((c) => c.trim()).filter(Boolean);
      const out: any[] = [];
      for (const r of rows) {
        out.push(
          await model.upsert({
            where: uniqueWhere(cols, r),
            create: withId(table, r),
            update: r,
          }),
        );
      }
      row = isArray ? out : out[0] ?? null;
    } else if (op === "update") {
      const where = body.match ?? {};
      await model.updateMany({ where, data: body.data });
      row = await model.findFirst({ where });
    } else if (op === "delete") {
      await model.deleteMany({ where: body.match ?? {} });
    } else {
      return json({ ok: false, error: "BAD_OP" }, 400);
    }

    return json({ ok: true, row: jsonSafe(row) });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WRITE_FAILED" }, 500);
  }
}
