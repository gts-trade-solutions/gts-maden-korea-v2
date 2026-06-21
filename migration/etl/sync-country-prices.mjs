// Resync product_country_prices Supabase (authoritative) -> MySQL (mirror).
// Admin country-offer edits write to Supabase but weren't mirrored, so MySQL
// went stale (e.g. an IN offer showing 399 in MySQL vs 499 in Supabase). This
// brings MySQL in line. Run: node migration/etl/sync-country-prices.mjs [--apply]
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const num = (v) => (v && typeof v.toNumber === "function" ? v.toNumber() : Number(v));

// page all Supabase offers
let sbRows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("product_country_prices")
    .select("id, product_id, country_code, offer_price, is_active, created_at, updated_at")
    .range(from, from + 999);
  if (error) throw error;
  sbRows = sbRows.concat(data);
  if (!data || data.length < 1000) break;
}

const myRows = await prisma.product_country_prices.findMany();
const myMap = new Map(myRows.map((r) => [r.id, r]));

let divergent = 0, missing = 0;
const examples = [];
for (const r of sbRows) {
  const m = myMap.get(r.id);
  if (!m) { missing++; continue; }
  if (num(m.offer_price) !== num(r.offer_price) || m.is_active !== r.is_active) {
    divergent++;
    if (examples.length < 8) examples.push(`${r.country_code} ${r.product_id.slice(0, 8)}: mysql ${num(m.offer_price)}/${m.is_active} -> sb ${num(r.offer_price)}/${r.is_active}`);
  }
}

console.log(`Supabase offers: ${sbRows.length} | MySQL offers: ${myRows.length}`);
console.log(`DIVERGENT (price/active differs): ${divergent} | MISSING in MySQL: ${missing}`);
if (examples.length) console.log("examples:\n  " + examples.join("\n  "));

if (!APPLY) {
  console.log("\n(dry run) re-run with --apply to sync Supabase -> MySQL");
  await prisma.$disconnect();
  process.exit(0);
}

let synced = 0;
for (const r of sbRows) {
  await prisma.product_country_prices.upsert({
    where: { id: r.id },
    update: { product_id: r.product_id, country_code: r.country_code, offer_price: r.offer_price, is_active: r.is_active, updated_at: new Date(r.updated_at) },
    create: { id: r.id, product_id: r.product_id, country_code: r.country_code, offer_price: r.offer_price, is_active: r.is_active, created_at: new Date(r.created_at), updated_at: new Date(r.updated_at) },
  });
  synced++;
}
console.log(`\n✅ synced ${synced} rows Supabase -> MySQL`);

// verify the reported product
const chk = await prisma.product_country_prices.findFirst({ where: { product_id: "550f38c0-bf15-487d-8331-1308005c4739", country_code: "IN" } });
console.log(`verify 550f38c0 IN -> MySQL offer_price now ${num(chk?.offer_price)} (expect 499)`);

await prisma.$disconnect();
