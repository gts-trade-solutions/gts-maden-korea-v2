// ===========================================================================
// data-copy.mjs — copy all row data from Supabase Postgres into local MySQL.
//
// WHAT IT DOES
//   For every base table in `public`:
//     1. Reads which columns actually exist in the MySQL target table
//        (so dropped columns like `search_tsv` are skipped automatically).
//     2. SELECTs the rows from Postgres.
//     3. Converts values for MySQL:
//          Date        -> 'YYYY-MM-DD HH:MM:SS.ffffff' (UTC)
//          boolean     -> 1 / 0
//          json/array  -> JSON string
//        (uuid stays a string, numbers/null pass through)
//     4. DELETEs the MySQL table then bulk-INSERTs in batches of 500.
//     5. Prints a Postgres-vs-MySQL row-count check per table.
//
//   FK checks are disabled during load so table order doesn't matter, then
//   re-enabled at the end. Re-runnable (idempotent: it clears each table first).
//
// PRE-REQ: the MySQL schema must already exist (run auto_schema.sql first).
//
// RUN:  node --env-file=migration/etl/.env migration/etl/data-copy.mjs
//       node --env-file=migration/etl/.env migration/etl/data-copy.mjs orders order_items   (subset)
// ===========================================================================

import pg from "pg";
import mysql from "mysql2/promise";

const PG_URL = process.env.SUPABASE_DB_URL;
const MY_URL = process.env.MYSQL_URL;
if (!PG_URL || !MY_URL) {
  console.error("Need SUPABASE_DB_URL and MYSQL_URL in migration/etl/.env");
  process.exit(1);
}

const BATCH = 500;
const only = process.argv.slice(2);     // optional table allow-list

function toMysqlValue(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    return v.toISOString().replace("T", " ").replace("Z", "");   // UTC datetime(6)
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Buffer.isBuffer(v)) return v;                               // bytea
  if (typeof v === "object") return JSON.stringify(v);            // jsonb / arrays
  return v;
}

async function main() {
  const pgc = new pg.Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
  await pgc.connect();
  const my = await mysql.createConnection({ uri: MY_URL, multipleStatements: false });

  let tables = (await pgc.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' order by table_name`
  )).rows.map(r => r.table_name);
  if (only.length) tables = tables.filter(t => only.includes(t));

  await my.query("SET FOREIGN_KEY_CHECKS = 0");
  const report = [];

  for (const t of tables) {
   try {
    // columns that exist on BOTH sides
    const [myCols] = await my.query(
      "select column_name from information_schema.columns where table_schema=database() and table_name=?",
      [t]
    );
    const myColSet = new Set(myCols.map(r => Object.values(r)[0]));  // COLUMN_NAME (case-proof)
    if (myColSet.size === 0) { report.push([t, "—", "SKIP (no MySQL table)"]); continue; }

    const pgRows = (await pgc.query(`select * from "${t}"`)).rows;
    const cols = pgRows.length
      ? Object.keys(pgRows[0]).filter(c => myColSet.has(c))
      : [...myColSet];

    await my.query(`DELETE FROM \`${t}\``);

    if (pgRows.length) {
      const colList = cols.map(c => "`" + c + "`").join(", ");
      for (let i = 0; i < pgRows.length; i += BATCH) {
        const slice = pgRows.slice(i, i + BATCH);
        const values = slice.map(row => cols.map(c => toMysqlValue(row[c])));
        await my.query(`INSERT INTO \`${t}\` (${colList}) VALUES ?`, [values]);
      }
    }

    const [[{ n }]] = await my.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    const match = Number(n) === pgRows.length ? "OK" : "MISMATCH";
    report.push([t, `${pgRows.length} -> ${n}`, match]);
    console.log(`${match === "OK" ? "✓" : "✗"} ${t.padEnd(34)} ${pgRows.length} -> ${n}`);
   } catch (e) {
    report.push([t, "ERROR", e.sqlMessage || e.code || e.message]);
    console.log(`✗ ${t.padEnd(34)} ERROR: ${e.sqlMessage || e.code || e.message}`);
   }
  }

  await my.query("SET FOREIGN_KEY_CHECKS = 1");
  await pgc.end();
  await my.end();

  const bad = report.filter(r => r[2] !== "OK" && !String(r[2]).startsWith("SKIP"));
  console.log(`\nDone. ${report.length} tables. ${bad.length ? bad.length + " MISMATCH" : "all counts match"}.`);
  if (bad.length) process.exit(2);
}

main().catch(e => { console.error(e); process.exit(1); });
