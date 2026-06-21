// Dual-write consistency sweep: compare row counts in Supabase vs MySQL for every
// table the MySQL read layer serves. A match = the mirror is in sync; a mismatch
// = drift that needs a re-sync (data-copy.mjs). Read-only. Run:
//   node migration/etl/test-consistency.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Every table except NextAuth-native (MySQL-source) + system. Auto-discovered so
// nothing (vendor or otherwise) is ever missed.
const DENY = new Set(["auth_users", "auth_accounts", "auth_sessions", "auth_verification_tokens", "_prisma_migrations", "_delete_debug"]);
const _disc = await prisma.$queryRawUnsafe(
  `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type='BASE TABLE' ORDER BY table_name`
);
const TABLES = _disc.map((r) => r.t ?? Object.values(r)[0]).filter((t) => t && !DENY.has(String(t).toLowerCase()));

let ok = 0, drift = 0, err = 0;
const mismatches = [];
console.log(`${"table".padEnd(34)} ${"supabase".padStart(9)} ${"mysql".padStart(9)}  status`);
console.log("-".repeat(70));
for (const t of TABLES) {
  try {
    const [{ count: sbCount, error: sbErr }, myCount] = await Promise.all([
      sb.from(t).select("*", { count: "exact", head: true }),
      prisma[t].count().catch(() => null),
    ]);
    if (sbErr) { console.log(`${t.padEnd(34)} ${"(sb err)".padStart(9)}            ⚠️  ${sbErr.message}`); err++; continue; }
    if (myCount == null) { console.log(`${t.padEnd(34)} ${String(sbCount).padStart(9)} ${"(no model)".padStart(9)}  ⚠️  no prisma model`); err++; continue; }
    const match = Number(sbCount) === Number(myCount);
    console.log(`${t.padEnd(34)} ${String(sbCount).padStart(9)} ${String(myCount).padStart(9)}  ${match ? "✅" : "❌ DRIFT (" + (Number(myCount) - Number(sbCount)) + ")"}`);
    if (match) ok++; else { drift++; mismatches.push({ t, sb: sbCount, my: myCount }); }
  } catch (e) {
    console.log(`${t.padEnd(34)} ${"ERROR".padStart(9)}            ⚠️  ${e.message}`); err++;
  }
}
console.log("-".repeat(70));
console.log(`${ok} in sync, ${drift} drifted, ${err} skipped/errored`);
if (mismatches.length) console.log("DRIFTED (re-sync with data-copy.mjs):", mismatches.map((m) => `${m.t}(sb${m.sb}/my${m.my})`).join(", "));
await prisma.$disconnect();
