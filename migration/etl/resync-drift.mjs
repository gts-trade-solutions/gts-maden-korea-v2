// One-time re-sync of drifted tables Supabase -> MySQL (full-table, column-safe,
// FK-safe) using the Supabase JS client + Prisma. Same approach as
// lib/data/mirror.ts but full-table, for re-seeding tables whose existing rows
// were never copied. Idempotent. Run:
//   node migration/etl/resync-drift.mjs brand_translations home_product_video_products ...
//   (no args = the known drifted set)
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const DEFAULT = ["brand_translations", "home_product_video_products", "home_influencer_video_products", "addresses", "payments", "payment_orders"];
const tables = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;

const coerce = (v, col) => {
  if (v == null) return null;
  if (typeof v === "string" && /(_at|_date|_until|_starts|_ends)$/.test(col)) return new Date(v);
  return v;
};

for (const table of tables) {
  try {
    const colRows = await prisma.$queryRawUnsafe(
      `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`, table
    );
    const cols = colRows.map((r) => r.c ?? Object.values(r)[0]).filter(Boolean);
    if (!cols.length) { console.log(`⚠️  ${table}: no MySQL table`); continue; }

    const { data: rows, error } = await sb.from(table).select(cols.join(",")).limit(10000);
    if (error) { console.log(`⚠️  ${table}: supabase read failed — ${error.message}`); continue; }

    const mapped = (rows ?? []).map((row) => { const o = {}; for (const c of cols) o[c] = coerce(row[c], c); return o; });
    const model = prisma[table];
    if (!model?.deleteMany) { console.log(`⚠️  ${table}: no prisma model`); continue; }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
      await tx[table].deleteMany({});
      if (mapped.length) await tx[table].createMany({ data: mapped });
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
    });

    const after = await prisma[table].count();
    console.log(`${after === (rows?.length ?? 0) ? "✅" : "✗"} ${table.padEnd(34)} supabase=${rows?.length ?? 0} -> mysql=${after}`);
  } catch (e) {
    console.log(`✗ ${table.padEnd(34)} ERROR: ${e.message}`);
  }
}
await prisma.$disconnect();
