# MadeNKorea data migration pipeline (Postgres → MySQL)

Two scripts move the whole database from Supabase Postgres into local MySQL.
Both read connection strings from `migration/etl/.env` (Node 21's `--env-file`).
Your Supabase password stays on this machine — it is never committed or sent anywhere.

## One-time: fill in the source connection

Open `migration/etl/.env` and paste your Supabase URI into `SUPABASE_DB_URL`
(Supabase dashboard → Project Settings → Database → Connection string → URI).
`MYSQL_URL` is already set for the local `madenkorea` database.

## Run order

```bash
# 1. Generate the full MySQL schema from the live Postgres structure
node --env-file=migration/etl/.env migration/etl/schema-gen.mjs
#    -> writes migration/mysql/auto_schema.sql  (all ~106 tables)

# 2. Load that schema into MySQL
mysql -u root -p madenkorea < migration/mysql/auto_schema.sql

# 3. Copy all the data across (with row-count verification)
node --env-file=migration/etl/.env migration/etl/data-copy.mjs

# (optional) copy just specific tables:
node --env-file=migration/etl/.env migration/etl/data-copy.mjs products brands
```

## After loading

```bash
# refresh the Prisma models from the now-complete MySQL schema
DATABASE_URL="mysql://root:Race%402023@127.0.0.1:3306/madenkorea" npx prisma db pull
npx prisma generate
```

## Notes / known translations the scripts handle for you

- `uuid → CHAR(36)`, `jsonb → JSON`, `timestamptz → DATETIME(6)`, `boolean → TINYINT(1)`,
  `numeric → DECIMAL`, postgres arrays → `JSON`, enums → `VARCHAR(64)`.
- `tsvector` columns are dropped and replaced by a `FULLTEXT` index.
- `pg_trgm` (GIN) and partial indexes become plain/omitted indexes.
- Foreign keys are added after all tables exist; cross-schema FKs (e.g. to
  Supabase `auth.users`) are skipped — those relationships move to the app's
  new auth layer.
- `data-copy.mjs` copies only columns present on BOTH sides, and clears each
  target table first, so it is safe to re-run.

## What still needs hand work after the bulk migration (tracked in ../MIGRATION_PLAN.md)

- The ~80 business-logic RPCs → TypeScript services (cart/checkout/promo/invoice/inventory).
- Auth (NextAuth: Google + Facebook + credentials) replacing Supabase Auth.
- Storage (S3) replacing Supabase Storage; copy bucket objects.
- Moving the 79 browser-side `.from()` calls onto server API routes + per-route authorization.
