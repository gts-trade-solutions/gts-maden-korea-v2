// Diagnose a cart price discrepancy: compare a product's pricing in Supabase vs
// MySQL, any IN country offer, and the latest cart_items snapshot for it.
// Run: node migration/etl/diag-price.mjs "K - Glass Skin Collagen"
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const NAME = process.argv[2] || "K - Glass Skin Collagen";
const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Supabase product
const { data: sp } = await sb
  .from("products")
  .select("id, name, price, sale_price, sale_starts_at, sale_ends_at, compare_at_price, is_published")
  .ilike("name", `%${NAME}%`)
  .limit(1)
  .maybeSingle();

console.log(`\nProduct match: ${sp?.name} (${sp?.id})`);
console.log("─".repeat(70));
console.log("SUPABASE product:", JSON.stringify({ price: sp?.price, sale_price: sp?.sale_price, compare_at_price: sp?.compare_at_price, sale_starts_at: sp?.sale_starts_at, sale_ends_at: sp?.sale_ends_at }));

if (sp?.id) {
  // MySQL product
  const mp = await prisma.products.findUnique({
    where: { id: sp.id },
    select: { price: true, sale_price: true, sale_starts_at: true, sale_ends_at: true, compare_at_price: true },
  }).catch((e) => ({ _err: e.message }));
  console.log("MYSQL    product:", JSON.stringify(mp, (k, v) => (typeof v === "bigint" ? Number(v) : v)));

  // Country offers (IN) — Supabase
  const { data: offers } = await sb
    .from("product_country_prices")
    .select("country_code, price, active")
    .eq("product_id", sp.id);
  console.log("SUPABASE country offers:", JSON.stringify(offers ?? []));

  // MySQL country offers
  const myOffers = await prisma.product_country_prices.findMany({ where: { product_id: sp.id }, select: { country_code: true, price: true, active: true } }).catch(() => ["(no table/err)"]);
  console.log("MYSQL    country offers:", JSON.stringify(myOffers, (k, v) => (typeof v === "bigint" ? Number(v) : v)));

  // Latest cart_items snapshot for this product (Supabase)
  const { data: ci } = await sb
    .from("cart_items")
    .select("cart_id, unit_price, mrp, quantity, line_total, created_at")
    .eq("product_id", sp.id)
    .order("created_at", { ascending: false })
    .limit(3);
  console.log("SUPABASE cart_items (latest 3):", JSON.stringify(ci ?? []));
}

await prisma.$disconnect();
