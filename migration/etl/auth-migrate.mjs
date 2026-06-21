// ===========================================================================
// auth-migrate.mjs — migrate Supabase Auth users into the MySQL NextAuth tables.
//
//   auth.users      -> auth_users   (keeps id; password_hash = bcrypt, no reset)
//   auth.identities -> auth_accounts (google/facebook OAuth links)
//
// Idempotent: clears auth_accounts + auth_users first. Run after auth_schema.sql.
// RUN: node --env-file=migration/etl/.env migration/etl/auth-migrate.mjs
// ===========================================================================

import pg from "pg";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";

const PG_URL = process.env.SUPABASE_DB_URL;
const MY_URL = process.env.MYSQL_URL;
if (!PG_URL || !MY_URL) { console.error("Need SUPABASE_DB_URL and MYSQL_URL in migration/etl/.env"); process.exit(1); }

const dt = (v) => (v ? new Date(v).toISOString().replace("T", " ").replace("Z", "") : null);

const pgc = new pg.Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const my = await mysql.createConnection({ uri: MY_URL });

// ── users ────────────────────────────────────────────────────────────────
const { rows: users } = await pgc.query(`
  select id, email, encrypted_password, email_confirmed_at,
         raw_user_meta_data->>'full_name' as full_name,
         coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture') as avatar_url,
         created_at
  from auth.users
  where deleted_at is null
`);

const lowEmails = users.map((u) => (u.email || "").toLowerCase()).filter(Boolean);
const dups = [...new Set(lowEmails.filter((e, i) => lowEmails.indexOf(e) !== i))];
if (dups.length) console.warn("WARNING duplicate emails (second occurrence will be skipped):", dups);

await my.query("DELETE FROM auth_accounts");
await my.query("DELETE FROM auth_users");

const insertedIds = new Set();
let withPw = 0, skipped = 0;
for (const u of users) {
  const pwHash = u.encrypted_password && u.encrypted_password.length ? u.encrypted_password : null;
  try {
    await my.query(
      "INSERT INTO auth_users (id, name, email, email_verified, image, password_hash, created_at) VALUES (?,?,?,?,?,?,?)",
      [u.id, u.full_name || null, u.email || null, dt(u.email_confirmed_at), u.avatar_url || null, pwHash, dt(u.created_at) ?? dt(new Date())]
    );
    insertedIds.add(u.id);
    if (pwHash) withPw++;
  } catch (e) {
    skipped++;
    console.warn(`  ! skipped user ${u.id} (${u.email}):`, e.code || e.message);
  }
}

// ── oauth accounts (only for users that imported, to satisfy the FK) ───────
const { rows: idents } = await pgc.query(
  `select provider, provider_id, user_id from auth.identities where provider in ('google','facebook')`
);
let acc = 0;
for (const it of idents) {
  if (!insertedIds.has(it.user_id)) continue;
  try {
    await my.query(
      "INSERT INTO auth_accounts (id, user_id, type, provider, provider_account_id) VALUES (?,?,?,?,?)",
      [randomUUID(), it.user_id, "oauth", it.provider, it.provider_id]
    );
    acc++;
  } catch (e) {
    console.warn(`  ! skipped account ${it.provider}/${it.user_id}:`, e.code || e.message);
  }
}

const [[uc]] = await my.query("SELECT COUNT(*) n FROM auth_users");
const [[pc]] = await my.query("SELECT COUNT(*) n FROM auth_users WHERE password_hash IS NOT NULL");
const [[ac]] = await my.query("SELECT COUNT(*) n FROM auth_accounts");
console.log(`\nauth_users: ${uc.n} (with password: ${pc.n})  · skipped: ${skipped}`);
console.log(`auth_accounts (oauth): ${ac.n}`);

await pgc.end();
await my.end();
