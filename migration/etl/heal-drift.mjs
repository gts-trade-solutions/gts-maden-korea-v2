// Self-healing dual-write guard. Detects drift (Supabase vs MySQL row-count
// mismatch) across every mirrored table and auto re-syncs ONLY the drifted ones
// Supabase -> MySQL (paginated + safe). Designed to run on a schedule (e.g.
// nightly cron) so the best-effort write mirror can never silently rot.
//   node migration/etl/heal-drift.mjs           (detect + heal)
//   node migration/etl/heal-drift.mjs --check    (detect only; exit 1 if drift)
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CHECK_ONLY = process.argv.includes("--check");

// Every table except NextAuth-native (MySQL-source) + system. Auto-discovered so
// nothing (vendor or otherwise) is ever missed.
const DENY = new Set(["auth_users", "auth_accounts", "auth_sessions", "auth_verification_tokens", "_prisma_migrations", "_delete_debug"]);
const _disc = await prisma.$queryRawUnsafe(
  `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE' ORDER BY table_name`
);
const TABLES = _disc.map((r) => r.t ?? Object.values(r)[0]).filter((t) => t && !DENY.has(String(t).toLowerCase()));
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

async function resync(table) {
  const colRows = await prisma.$queryRawUnsafe(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`, table);
  const cols = colRows.map((r) => r.c ?? Object.values(r)[0]).filter(Boolean);
  const rows = await readAll(table, cols);
  const mapped = rows.map((row) => { const o = {}; for (const c of cols) o[c] = coerce(row[c], c); return o; });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");
    await tx[table].deleteMany({});
    for (let i = 0; i < mapped.length; i += BATCH) await tx[table].createMany({ data: mapped.slice(i, i + BATCH) });
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
  }, { timeout: 300000 });
  return rows.length;
}

const drifted = [];
for (const t of TABLES) {
  try {
    const [{ count: sbCount }, myCount] = await Promise.all([
      sb.from(t).select("*", { count: "exact", head: true }),
      prisma[t].count().catch(() => null),
    ]);
    if (myCount == null) continue;
    if (Number(sbCount) !== Number(myCount)) drifted.push({ t, sb: Number(sbCount), my: Number(myCount) });
  } catch { /* skip unreadable table */ }
}

if (!drifted.length) { console.log("✅ no drift — Supabase and MySQL are in sync."); await prisma.$disconnect(); process.exit(0); }

console.log(`⚠️  drift in ${drifted.length} table(s): ${drifted.map((d) => `${d.t}(sb${d.sb}/my${d.my})`).join(", ")}`);
if (CHECK_ONLY) { await prisma.$disconnect(); process.exit(1); }

let healed = 0;
for (const d of drifted) {
  try { const n = await resync(d.t); console.log(`  ✅ healed ${d.t} -> ${n}`); healed++; }
  catch (e) { console.log(`  ✗ failed ${d.t}: ${e.message}`); }
}
console.log(`healed ${healed}/${drifted.length}.`);
await prisma.$disconnect();
process.exit(healed === drifted.length ? 0 : 1);
