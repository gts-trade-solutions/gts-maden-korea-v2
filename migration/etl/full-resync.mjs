// Full Supabase -> MySQL replicate for every dual-write / MySQL-read table.
// Supabase is authoritative ("latest"); this brings MySQL fully up to date.
// SAFE: paginates Supabase reads (so large tables aren't capped at 1000 and
// truncated), batches inserts, and wraps each table's delete+insert in a single
// FK-off transaction that ROLLS BACK on any error (so a failure never leaves a
// table half-empty). Idempotent. Run:
//   node migration/etl/full-resync.mjs                 (all tables below)
//   node migration/etl/full-resync.mjs brands orders   (subset)
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Replicate EVERY table by default (incl. vendor_members/vendors and all the
// rest). Exclude only NextAuth-native tables — they are MySQL-SOURCE (auth_users
// holds the migrated bcrypt passwords; they don't exist in Supabase's public
// schema) — and system/junk tables. Tables that don't exist in Supabase are
// skipped automatically (the read just returns nothing to mirror).
const DENY = new Set([
  "auth_users", "auth_accounts", "auth_sessions", "auth_verification_tokens",
  "_prisma_migrations", "_delete_debug",
]);
let tables = process.argv.slice(2);
if (!tables.length) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE' ORDER BY table_name`
  );
  tables = rows.map((r) => r.t ?? Object.values(r)[0]).filter((t) => t && !DENY.has(String(t).toLowerCase()));
}

const PAGE = 1000, BATCH = 500;
const coerce = (v, col) => (v != null && typeof v === "string" && /(_at|_date|_until|_starts|_ends)$/.test(col) ? new Date(v) : v);

async function readAll(table, cols) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(cols.join(",")).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

let ok = 0, skip = 0, fail = 0;
for (const table of tables) {
  try {
    const colRows = await prisma.$queryRawUnsafe(
      `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`, table
    );
    const cols = colRows.map((r) => r.c ?? Object.values(r)[0]).filter(Boolean);
    if (!cols.length || !prisma[table]?.deleteMany) { console.log(`⏭️  ${table.padEnd(34)} (no MySQL table/model)`); skip++; continue; }

    let rows;
    try { rows = await readAll(table, cols); }
    catch (e) { console.log(`⏭️  ${table.padEnd(34)} (not in Supabase / read failed: ${e.message})`); skip++; continue; }

    const mapped = rows.map((row) => { const o = {}; for (const c of cols) o[c] = coerce(row[c], c); return o; });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
      await tx[table].deleteMany({});
      for (let i = 0; i < mapped.length; i += BATCH) await tx[table].createMany({ data: mapped.slice(i, i + BATCH) });
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
    }, { timeout: 300000 });

    const after = await prisma[table].count();
    const good = after === rows.length;
    console.log(`${good ? "✅" : "✗"} ${table.padEnd(34)} supabase=${rows.length} -> mysql=${after}`);
    good ? ok++ : fail++;
  } catch (e) {
    console.log(`✗ ${table.padEnd(34)} ERROR: ${e.message}`); fail++;
  }
}
console.log(`\n${ok} replicated, ${skip} skipped, ${fail} failed.`);
await prisma.$disconnect();
process.exit(fail ? 1 : 0);
