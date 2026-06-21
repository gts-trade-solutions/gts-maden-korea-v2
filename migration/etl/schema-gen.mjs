// ===========================================================================
// schema-gen.mjs — generate a complete MySQL 8 schema from the live Supabase
// Postgres database.
//
// WHAT IT DOES
//   1. Connects to Postgres (SUPABASE_DB_URL).
//   2. Reads every base table in schema `public`: columns, primary keys,
//      unique/normal indexes, and foreign keys.
//   3. Emits MySQL DDL into migration/mysql/auto_schema.sql applying the same
//      Postgres->MySQL rulebook validated on slice 01:
//        uuid->CHAR(36) · text->VARCHAR/ MEDIUMTEXT · timestamptz->DATETIME(6)
//        numeric->DECIMAL · boolean->TINYINT(1) · jsonb/json->JSON
//        tsvector->dropped (+FULLTEXT) · arrays/enums->JSON/VARCHAR
//        partial & GIN/GiST indexes->plain/skip · FK ON DELETE rules preserved
//
// IT ONLY READS Postgres and WRITES a .sql file. It does not touch either DB's
// data. Apply the file separately (see migration/etl/README.md).
//
// RUN:  node --env-file=migration/etl/.env migration/etl/schema-gen.mjs
// ===========================================================================

import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const PG_URL = process.env.SUPABASE_DB_URL;
if (!PG_URL) {
  console.error("Missing SUPABASE_DB_URL (set it in migration/etl/.env)");
  process.exit(1);
}

const OUT = path.resolve("migration/mysql/auto_schema.sql");

// ── Postgres -> MySQL type mapping ────────────────────────────────────────
function mapType(col, indexedCols) {
  const t = col.udt_name;            // e.g. 'int4', 'text', 'numeric', '_text'
  const dt = col.data_type;          // e.g. 'integer', 'ARRAY', 'USER-DEFINED'
  const isIndexed = indexedCols.has(col.column_name);

  if (dt === "ARRAY") return "JSON";                       // postgres arrays -> JSON
  if (dt === "USER-DEFINED") return "VARCHAR(64)";         // enums -> string

  switch (t) {
    case "uuid": return "CHAR(36)";
    case "bool": return "TINYINT(1)";
    case "int2": return "SMALLINT";
    case "int4": return "INT";
    case "int8": return "BIGINT";
    case "float4": return "FLOAT";
    case "float8": return "DOUBLE";
    case "numeric": {
      const p = col.numeric_precision, s = col.numeric_scale;
      return p ? `DECIMAL(${p},${s ?? 0})` : "DECIMAL(20,6)";  // unbounded -> safe default
    }
    case "date": return "DATE";
    case "time": case "timetz": return "TIME(6)";
    case "timestamp": case "timestamptz": return "DATETIME(6)";
    case "json": case "jsonb": return "JSON";
    case "bytea": return "LONGBLOB";
    case "inet": case "cidr": case "macaddr": return "VARCHAR(64)";
    case "interval": return "VARCHAR(64)";
    case "tsvector": return null;                            // dropped -> FULLTEXT instead
    case "bpchar": return `CHAR(${col.character_maximum_length ?? 1})`;
    case "varchar":
      return `VARCHAR(${col.character_maximum_length ?? 255})`;
    case "text":
      // MySQL can't index TEXT, and TEXT can't take a literal DEFAULT, so
      // promote indexed / defaulted text columns to VARCHAR.
      if (isIndexed) return "VARCHAR(255)";
      if (col.column_default != null) return "VARCHAR(512)";
      return "MEDIUMTEXT";
    default:
      console.warn(`  ! unknown type ${t}/${dt} on ${col.table_name}.${col.column_name} -> TEXT`);
      return "MEDIUMTEXT";
  }
}

// ── default-value translation ─────────────────────────────────────────────
function mapDefault(col) {
  let d = col.column_default;
  if (d == null) return { sql: "", autoInc: false };
  if (/nextval\(/i.test(d)) return { sql: "", autoInc: true };          // serial -> AUTO_INCREMENT
  if (/gen_random_uuid|uuid_generate/i.test(d)) return { sql: "", autoInc: false }; // app/data supplies id
  if (/^now\(\)/i.test(d)) return { sql: "DEFAULT CURRENT_TIMESTAMP(6)", autoInc: false };
  if (d === "true") return { sql: "DEFAULT 1", autoInc: false };
  if (d === "false") return { sql: "DEFAULT 0", autoInc: false };

  // postgres arrays map to JSON; emit an empty-array JSON default (actual
  // values are carried over by data-copy). JSON can't take a literal default.
  if (col.data_type === "ARRAY") return { sql: "DEFAULT (CAST('[]' AS JSON))", autoInc: false };

  // strip postgres casts:  'INR'::text -> 'INR'
  d = d.replace(/::[a-zA-Z_0-9 \[\]"]+/g, "").trim();

  if (col.udt_name === "jsonb" || col.udt_name === "json") {
    const lit = d.replace(/^'|'$/g, "");
    return { sql: `DEFAULT (CAST('${lit}' AS JSON))`, autoInc: false };
  }
  if (/^current_date$/i.test(d)) return { sql: "DEFAULT (CURRENT_DATE)", autoInc: false };
  if (/^current_timestamp/i.test(d)) return { sql: "DEFAULT CURRENT_TIMESTAMP(6)", autoInc: false };
  // keep plain quoted-string or numeric literals
  if (/^'.*'$/s.test(d) || /^-?\d+(\.\d+)?$/.test(d)) return { sql: `DEFAULT ${d}`, autoInc: false };
  // anything else — unknown function calls like auth.uid() — drop it (app sets the value)
  return { sql: "", autoInc: false };
}

const ident = (s) => "`" + s + "`";
const PG_DEL = { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" };

async function main() {
  const client = new pg.Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const tables = (await client.query(
    `select t.table_name from information_schema.tables t
     where t.table_schema='public' and t.table_type='BASE TABLE'
     order by t.table_name`)).rows.map(r => r.table_name);

  const cols = (await client.query(
    `select table_name, column_name, ordinal_position, data_type, udt_name,
            character_maximum_length, numeric_precision, numeric_scale,
            is_nullable, column_default
     from information_schema.columns
     where table_schema='public' order by table_name, ordinal_position`)).rows;

  const idx = (await client.query(
    `select tb.relname as table_name, ix.relname as index_name,
            i.indisunique as is_unique, i.indisprimary as is_primary,
            am.amname as method,
            pg_get_expr(i.indpred, i.indrelid) as pred,
            (select array_agg(pg_get_indexdef(i.indexrelid, k+1, true)
                    order by k) from generate_subscripts(i.indkey,1) k) as cols
     from pg_index i
     join pg_class ix on ix.oid=i.indexrelid
     join pg_class tb on tb.oid=i.indrelid
     join pg_namespace n on n.oid=tb.relnamespace
     join pg_am am on am.oid=ix.relam
     where n.nspname='public' order by tb.relname, ix.relname`)).rows;

  const fks = (await client.query(
    `select con.conname,
            tb.relname as table_name,
            (select array_to_string(array_agg(a.attname::text order by x.ord), ',')
               from unnest(con.conkey) with ordinality x(attnum,ord)
               join pg_attribute a on a.attrelid=con.conrelid and a.attnum=x.attnum) as cols,
            reftb.relname as ref_table,
            (select array_to_string(array_agg(a.attname::text order by x.ord), ',')
               from unnest(con.confkey) with ordinality x(attnum,ord)
               join pg_attribute a on a.attrelid=con.confrelid and a.attnum=x.attnum) as ref_cols,
            con.confdeltype as del_rule
     from pg_constraint con
     join pg_class tb on tb.oid=con.conrelid
     join pg_namespace n on n.oid=tb.relnamespace
     join pg_class reftb on reftb.oid=con.confrelid
     join pg_namespace rn on rn.oid=reftb.relnamespace
     where con.contype='f' and n.nspname='public' and rn.nspname='public'`)).rows;

  await client.end();

  const tableSet = new Set(tables);
  const colsByTable = groupBy(cols, "table_name");
  const idxByTable = groupBy(idx, "table_name");

  let out = `-- AUTO-GENERATED by migration/etl/schema-gen.mjs on ${new Date().toISOString()}\n`;
  out += `-- Complete MySQL 8 schema for the MadeNKorea migration. Safe to re-run.\n\n`;
  out += `SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`;

  // drop in reverse so re-runs are clean
  for (const t of [...tables].reverse()) out += `DROP TABLE IF EXISTS ${ident(t)};\n`;
  out += `\n`;

  const fkStatements = [];

  for (const t of tables) {
    const tcols = colsByTable[t] || [];
    const tidx = (idxByTable[t] || []);
    const indexedCols = new Set();
    for (const ix of tidx) for (const c of ix.cols || []) indexedCols.add(c.replace(/`/g, "").replace(/"/g, ""));

    const lines = [];
    const hasTsvector = tcols.some(c => c.udt_name === "tsvector");

    for (const c of tcols) {
      const type = mapType(c, indexedCols);
      if (type == null) continue;                       // tsvector dropped
      const def = mapDefault(c);
      const nn = c.is_nullable === "NO" ? " NOT NULL" : " NULL";
      const ai = def.autoInc ? " AUTO_INCREMENT" : "";
      const onUpd = (c.column_name === "updated_at" && /now\(\)/i.test(c.column_default || ""))
        ? " ON UPDATE CURRENT_TIMESTAMP(6)" : "";
      const dflt = def.sql ? " " + def.sql : "";
      lines.push(`  ${ident(c.column_name)} ${type}${nn}${ai}${dflt}${onUpd}`);
    }

    // primary key + indexes
    for (const ix of tidx) {
      const method = ix.method;
      if (method === "gin" || method === "gist") continue;          // trgm/tsvector -> skip
      const cols = (ix.cols || []).map(c => c.replace(/"/g, ""));
      if (cols.some(c => c.includes("(") || c.includes(" ")))        // expression index -> skip
        continue;
      const keyCols = cols.map(ident).join(", ");
      const isPartial = ix.pred != null && String(ix.pred).length > 0;
      if (ix.is_primary) lines.push(`  PRIMARY KEY (${keyCols})`);
      else if (ix.is_unique && !isPartial) lines.push(`  UNIQUE KEY ${ident(ix.index_name)} (${keyCols})`);
      // partial unique (UNIQUE ... WHERE ...) can't exist in MySQL -> plain index; app enforces the rule
      else lines.push(`  KEY ${ident(ix.index_name)} (${keyCols})`);
    }

    // FULLTEXT to replace a dropped tsvector column
    if (hasTsvector) {
      const ftCandidates = ["name", "title", "short_description", "description", "body"]
        .filter(n => tcols.some(c => c.column_name === n));
      if (ftCandidates.length) lines.push(`  FULLTEXT KEY ${ident(t + "_ft")} (${ftCandidates.map(ident).join(", ")})`);
    }

    out += `CREATE TABLE ${ident(t)} (\n${lines.join(",\n")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;\n\n`;
  }

  // foreign keys as ALTERs (after all tables exist) — only public->public refs
  for (const fk of fks) {
    if (!tableSet.has(fk.ref_table)) continue;
    if (!fk.cols || !fk.ref_cols) continue;
    const cols = fk.cols.split(",").map(ident).join(", ");
    const refCols = fk.ref_cols.split(",").map(ident).join(", ");
    const rule = PG_DEL[fk.del_rule] || "NO ACTION";
    fkStatements.push(
      `ALTER TABLE ${ident(fk.table_name)} ADD CONSTRAINT ${ident(fk.conname)} ` +
      `FOREIGN KEY (${cols}) REFERENCES ${ident(fk.ref_table)} (${refCols}) ON DELETE ${rule};`);
  }
  out += fkStatements.join("\n") + "\n\n";
  out += `SET FOREIGN_KEY_CHECKS = 1;\n`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out, "utf8");
  console.log(`Wrote ${OUT}`);
  console.log(`Tables: ${tables.length} · FKs: ${fkStatements.length}`);
}

function groupBy(rows, key) {
  const m = {};
  for (const r of rows) (m[r[key]] ||= []).push(r);
  return m;
}

main().catch(e => { console.error(e); process.exit(1); });
