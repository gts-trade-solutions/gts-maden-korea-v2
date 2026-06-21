// Test harness for the order-creation reprice fix.
//
// Proves that repricing a live cart to current effective prices (the
// SAME logic calc-totals uses) yields the total the checkout page shows,
// instead of the stale snapshot the order is currently built from.
//
// Read-only: it does NOT write to either DB. Run:  node test-reprice.mjs <email>
import "dotenv/config";
import pg from "pg";
import mysql from "mysql2/promise";

const EMAIL = process.argv[2] || "arunpandian972000@gmail.com";
const COUNTRY = process.argv[3] || "IN"; // buyer country (mik_country cookie; IN default)

// ── pricing helpers (verbatim copy of lib/pricing.ts logic) ──────────
function effectiveUnitPrice(p) {
  const now = Date.now();
  const withinSale =
    p.sale_price != null &&
    (!p.sale_starts_at || new Date(p.sale_starts_at).getTime() <= now) &&
    (!p.sale_ends_at || new Date(p.sale_ends_at).getTime() >= now);
  return withinSale ? Number(p.sale_price) : Number(p.price ?? 0);
}
function effectivePriceForCountry(p, offers) {
  if (p.id && offers[p.id] != null) return Number(offers[p.id]);
  return effectiveUnitPrice(p);
}
const round = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

const pgc = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
const my = await mysql.createConnection(process.env.MYSQL_URL);
await pgc.connect();

// 1) Authoritative cart lines from Supabase (what create_order_from_cart reads)
const { rows: lines } = await pgc.query(
  `select ci.id, ci.product_id, ci.name, ci.unit_price, ci.quantity, ci.line_total
     from cart_items ci
     join carts c on c.id = ci.cart_id
     join auth.users u on u.id = c.user_id
    where u.email = $1
    order by ci.created_at`,
  [EMAIL]
);
if (!lines.length) {
  console.log(`No cart items for ${EMAIL}`);
  process.exit(0);
}
const ids = [...new Set(lines.map((l) => l.product_id))];

// 2) Live product price fields (MySQL == what calc-totals reads behind the flag)
const [prods] = await my.query(
  `select id, name, price, sale_price, sale_starts_at, sale_ends_at from products where id in (${ids
    .map(() => "?")
    .join(",")})`,
  ids
);
const prodMap = new Map(prods.map((p) => [p.id, p]));

// 3) Live country offers for the buyer's country
const [offerRows] = await my.query(
  `select product_id, offer_price from product_country_prices
     where is_active = 1 and country_code = ? and product_id in (${ids
       .map(() => "?")
       .join(",")})`,
  [COUNTRY, ...ids]
);
const offers = {};
for (const r of offerRows) offers[r.product_id] = Number(r.offer_price);

// 4) Reprice each line and compare
let snapshotSubtotal = 0;
let liveSubtotal = 0;
console.log(`\nReprice test for ${EMAIL} (country=${COUNTRY})\n`);
for (const l of lines) {
  const p = prodMap.get(l.product_id);
  const liveUnit = effectivePriceForCountry({ ...p, id: l.product_id }, offers);
  const liveLine = round(liveUnit * Number(l.quantity));
  snapshotSubtotal = round(snapshotSubtotal + Number(l.line_total));
  liveSubtotal = round(liveSubtotal + liveLine);
  console.log(
    `  ${l.name}  x${l.quantity}\n` +
      `     snapshot: ${l.unit_price} -> line ${l.line_total}\n` +
      `     live:     ${liveUnit} -> line ${liveLine}\n`
  );
}
console.log(`  Snapshot subtotal (what order/Razorpay charges today): ${snapshotSubtotal}`);
console.log(`  Live subtotal (reprice result):                        ${liveSubtotal}`);

// Independent source of truth: ask the live calc-totals endpoint (the
// exact thing that renders the checkout page total) for the same lines.
// The reprice is correct iff it equals what the page shows.
const CALC_URL = process.env.CALC_URL || "http://localhost:3001/api/checkout/calc-totals";
let calcSubtotal = null;
try {
  const res = await fetch(CALC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: lines.map((l) => ({ product_id: l.product_id, qty: Number(l.quantity) })),
    }),
  });
  const j = await res.json();
  if (j?.ok) calcSubtotal = Number(j.subtotal);
  else console.log(`  calc-totals error: ${JSON.stringify(j)}`);
} catch (e) {
  console.log(`  calc-totals unreachable: ${e.message}`);
}

console.log(`  calc-totals subtotal (what the checkout page shows):   ${calcSubtotal}`);

const pass = calcSubtotal != null && liveSubtotal === calcSubtotal;
console.log(
  `\n  ${pass ? "PASS ✓" : "FAIL ✗"} reprice subtotal === calc-totals subtotal` +
    `   (snapshot overcharge would be +${round(snapshotSubtotal - liveSubtotal)})\n`
);

await pgc.end();
await my.end();
process.exit(pass ? 0 : 1);
