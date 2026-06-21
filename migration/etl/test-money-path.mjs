// Money-path E2E (scriptable + SAFE surface) under NextAuth + MySQL:
//   register -> nextauth login -> ensure_cart_as -> add_to_cart_as (the auth.uid()
//   bridge) -> /api/cart/state (MySQL read) -> /api/checkout/calc-totals
//   (server-authoritative pricing). Self-cleaning.
//
// Deliberately STOPS before /api/razorpay/create + /verify: verify marks orders
// paid + sends real SES emails, and its HMAC signature needs the key secret or a
// real test-card payment — that step is the manual browser test-card pass.
//
// Run against a server started with AUTH_BACKEND=nextauth (+ CATALOG_BACKEND=mysql):
//   node migration/etl/test-money-path.mjs http://localhost:3000
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = `moneypath-${Date.now()}@example.com`;
const PASS = "Testpass1!";
const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const jar = {};
const stash = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); } };
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
const postJson = async (path, body) => { const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie: cookie() }, body: JSON.stringify(body) }); stash(r); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const getJson = async (path) => { const r = await fetch(`${BASE}${path}`, { headers: { cookie: cookie() } }); stash(r); return { status: r.status, json: await r.json().catch(() => ({})) }; };

let id = null;
let pass = 0, fail = 0;
const ok = (cond, label, extra = "") => { if (cond) { pass++; console.log(`✅ ${label}`); } else { fail++; console.log(`❌ ${label} ${extra}`); } };

try {
  // 0) pick a published, in-stock, priced product
  const { data: prod } = await sb.from("products")
    .select("id,name,price,stock_qty,is_published")
    .eq("is_published", true).gt("stock_qty", 0).gt("price", 0)
    .limit(1).maybeSingle();
  if (!prod) throw new Error("no published in-stock priced product to test with");
  const QTY = 2;
  console.log(`product: ${prod.name} (${prod.id}) price=₹${prod.price} stock=${prod.stock_qty}`);

  // 1) register + nextauth login
  const reg = await (await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASS, full_name: "MoneyPath" }) })).json();
  id = reg.id;
  ok(!!id, "register returns user id");
  const csrf = await (async () => { const r = await fetch(`${BASE}/api/auth/csrf`); stash(r); return (await r.json()).csrfToken; })();
  const login = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken: csrf, email: EMAIL, password: PASS, json: "true" }).toString(), redirect: "manual" });
  stash(login);
  ok(!!jar["next-auth.session-token"] || !!jar["__Secure-next-auth.session-token"], "nextauth session cookie set");

  // 2) ensure cart + add via the auth.uid() bridge (add_to_cart_as under nextauth)
  const ensure = await postJson("/api/cart/mutate", { action: "ensure" });
  ok(ensure.json?.ok, "cart ensure ok", JSON.stringify(ensure.json));
  const add = await postJson("/api/cart/mutate", { action: "add", product_id: prod.id, qty: QTY });
  ok(add.json?.ok, "cart add ok (add_to_cart bridge)", JSON.stringify(add.json));

  // 3) cart state (MySQL read under the flag, Supabase fallback otherwise)
  const state = await getJson("/api/cart/state");
  const items = state.json?.items ?? [];
  const line = items.find((i) => (i.product_id || i.product?.id) === prod.id);
  ok(!!line, "cart state shows the added product");
  ok(line && Number(line.quantity) === QTY, "cart line quantity = 2", line ? `got ${line.quantity}` : "no line");

  // 4) calc-totals (server-authoritative pricing; reads products from MySQL)
  const totals = await postJson("/api/checkout/calc-totals", { lines: [{ product_id: prod.id, qty: QTY }] });
  ok(totals.json?.ok, "calc-totals ok", JSON.stringify(totals.json).slice(0, 200));
  const t = totals.json;
  if (t.ok) {
    // The server applies the EFFECTIVE price (country offer > sale_price > list
    // price), which may sit below products.price — so validate internal
    // consistency against the response's own authoritative unit, not the raw list.
    const lr = (t.lines || [])[0];
    ok(lr && Number(lr.qty) === QTY, "calc-totals line qty = 2");
    ok(lr && Math.abs(Number(lr.line_subtotal) - Number(lr.unit_price) * QTY) < 0.01, "line_subtotal = unit_price × qty");
    ok(lr && Math.abs(Number(t.subtotal) - Number(lr.line_subtotal)) < 0.01, "subtotal = Σ line_subtotal");
    ok(lr && Number(lr.unit_price) <= Number(prod.price) + 0.01, "effective unit_price ≤ list price (offer/sale applied)", lr ? `unit ${lr.unit_price} vs list ${prod.price}` : "");
    const recomputed = Math.round((Number(t.subtotal) + Number(t.shipping_fee) - Number(t.discount_total)) * 100) / 100;
    ok(Math.abs(recomputed - Number(t.total)) < 0.01, "total = subtotal + shipping − discount", `recomputed ${recomputed}, got ${t.total}`);
    console.log(`   unit=${lr?.unit_price} (list ${prod.price}) subtotal=${t.subtotal} shipping=${t.shipping_fee} discount=${t.discount_total} total=${t.total} (${t.country})`);
  }

  // 5) clear cart (dual-write clear)
  const clr = await postJson("/api/cart/clear", {});
  ok(clr.status === 200, "cart clear ok");

  console.log(`\nNOTE: razorpay/create + /verify intentionally NOT scripted (emails + paid orders + signature). Do those in the browser with a Razorpay test card.`);
} catch (e) {
  fail++;
  console.error("ERROR:", e.message || e);
} finally {
  if (id) { try { await sb.auth.admin.deleteUser(id); } catch {} try { await prisma.cart_items.deleteMany({ where: { carts: { user_id: id } } }); } catch {} try { await prisma.carts.deleteMany({ where: { user_id: id } }); } catch {} try { await prisma.profiles.deleteMany({ where: { id } }); } catch {} try { await prisma.user.deleteMany({ where: { id } }); } catch {} }
  await prisma.$disconnect();
  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ " + fail + " FAILED"} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}
