// Smoke-test the CHECKOUT money path under a NextAuth session (no real payment).
// Proves the cart routes + calc-totals resolve the user AND aren't RLS-blocked
// (the cart routes query Supabase via an anon+cookie client, which has no
// auth.uid() under NextAuth — this confirms whether that breaks).
//
//   register -> NextAuth login -> add to cart -> read state -> calc-totals
//
// Run with the server flipped to nextauth:  node migration/etl/test-checkout-nextauth.mjs [baseUrl]
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3001";
const EMAIL = `co-test-${Date.now()}@example.com`;
const PASSWORD = "Testpass1!";

const prisma = new PrismaClient();
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const jar = {};
const stash = (res) => {
  for (const c of res.headers.getSetCookie?.() || []) {
    const kv = c.split(";")[0];
    const i = kv.indexOf("=");
    if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1);
  }
};
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

let id = null;
try {
  // pick a real, in-stock product to add
  const { data: prod } = await sb
    .from("products")
    .select("id, slug, name, price")
    .eq("is_published", true)
    .gt("price", 0)
    .limit(1)
    .maybeSingle();
  console.log(`product: ${prod?.name ?? "—"} (${prod?.id ?? "none"})`);
  if (!prod?.id) throw new Error("no product found to add");

  // register + NextAuth login
  const reg = await (await fetch(`${BASE}/api/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, full_name: "CO Test" }),
  })).json();
  id = reg.id;
  console.log(`register: ${id ? "ok " + id : JSON.stringify(reg)}`);
  if (!id) throw new Error("register failed");

  const csrf = await (await (async () => { const r = await fetch(`${BASE}/api/auth/csrf`); stash(r); return r; })()).json();
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: PASSWORD, json: "true" }).toString(),
    redirect: "manual",
  });
  stash(loginRes);
  const authed = Object.keys(jar).some((k) => k.includes("session-token"));
  console.log(`nextauth login: ${authed ? "session ✓" : "NO SESSION ✗"}`);

  // add to cart
  const addRes = await fetch(`${BASE}/api/cart/mutate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie() },
    body: JSON.stringify({ action: "add", product_id: prod.id, qty: 1 }),
  });
  const add = await addRes.json().catch(() => ({}));
  console.log(`cart add:      ${addRes.status} ${JSON.stringify(add)}`);

  // read cart state
  const stateRes = await fetch(`${BASE}/api/cart/state`, { headers: { cookie: cookie() }, cache: "no-store" });
  const state = await stateRes.json().catch(() => ({}));
  const itemCount = (state.items || []).length;
  console.log(`cart state:    ${stateRes.status} items=${itemCount} subtotal=${state?.cart?.subtotal ?? "—"}`);

  // calc-totals (server-authoritative pricing)
  const calcRes = await fetch(`${BASE}/api/checkout/calc-totals`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie() },
    body: JSON.stringify({ lines: [{ product_id: prod.id, qty: 1 }], country: "IN" }),
  });
  const calc = await calcRes.json().catch(() => ({}));
  console.log(`calc-totals:   ${calcRes.status} subtotal=${calc?.subtotal ?? calc?.totals?.subtotal ?? "—"} total=${calc?.total ?? calc?.totals?.total ?? "—"}`);

  // orders/create — the real pending-order creation (create_order_from_cart_as under nextauth)
  const ordRes = await fetch(`${BASE}/api/orders/create`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie() },
    body: JSON.stringify({
      address: { full_name: "CO Test", phone: "9999999999", line1: "1 Test St", city: "Chennai", state: "TN", postal_code: "600001", country: "IN" },
      notes: "checkout smoke",
    }),
  });
  const ord = await ordRes.json().catch(() => ({}));
  console.log(`orders/create: ${ordRes.status} ${ord?.ok ? "order=" + ord.order_number + " total=" + ord.total : JSON.stringify(ord)}`);

  console.log("─".repeat(60));
  const cartOk = addRes.ok && itemCount > 0;
  const orderOk = ordRes.ok && ord?.ok && !!ord?.order_id;
  console.log(
    cartOk && calcRes.ok && orderOk
      ? `✅ MONEY PATH WORKS under NextAuth — cart add + state + calc-totals + orders/create all green. order ${ord.order_number} (total ${ord.total}). Only the Razorpay payment is left (browser).`
      : `❌ money-path issue — cartOk=${cartOk}, calc=${calcRes.status}, orderOk=${orderOk} ${JSON.stringify(ord)}`
  );
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  if (id) {
    // orders first (FK to user) — Supabase + MySQL
    try { const { data: ords } = await sb.from("orders").select("id").eq("user_id", id); for (const o of ords ?? []) await sb.from("order_items").delete().eq("order_id", o.id); await sb.from("orders").delete().eq("user_id", id); } catch (e) { console.error("cleanup sb orders:", e.message); }
    try { const mo = await prisma.orders.findMany({ where: { user_id: id }, select: { id: true } }); for (const o of mo) await prisma.order_items.deleteMany({ where: { order_id: o.id } }); await prisma.orders.deleteMany({ where: { user_id: id } }); } catch {}
    try { await prisma.cart_items.deleteMany({ where: { carts: { user_id: id } } }); } catch {}
    try { await prisma.carts.deleteMany({ where: { user_id: id } }); } catch {}
    try { await sb.auth.admin.deleteUser(id); } catch {}
    try { await prisma.profiles.delete({ where: { id } }); } catch {}
    try { await prisma.user.delete({ where: { id } }); } catch {}
    console.log(`cleaned up ${id}`);
  }
  await prisma.$disconnect();
}
