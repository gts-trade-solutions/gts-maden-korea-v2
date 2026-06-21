// Prove the two headline blocker fixes now work under NextAuth:
//   A) wishlist: /api/wishlist add -> read -> remove (user-scoped, service-role)
//   B) admin order status: /api/admin/catalog/write orders update -> persists in BOTH DBs
// Self-cleaning. Run: node migration/etl/test-blockers.mjs http://localhost:3000
import { config } from "dotenv";
config({ path: ".env.local" }); config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let pass = 0, fail = 0;
const ok = (c, label, extra = "") => { c ? (pass++, console.log(`✅ ${label}`)) : (fail++, console.log(`❌ ${label} ${extra}`)); };

function session() {
  const jar = {};
  const stash = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); } };
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  return { jar, stash, cookie };
}
async function login(email, s) {
  const csrf = await (await (async () => { const r = await fetch(`${BASE}/api/auth/csrf`); s.stash(r); return r; })()).json();
  s.stash(await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: s.cookie() }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password: "Testpass1!", json: "true" }).toString(), redirect: "manual" }));
}

let uid = null, aid = null, orderId = null, origStatus = null;
try {
  // ---- A) WISHLIST ----
  const uEmail = `wl-${Date.now()}@example.com`;
  const ureg = await (await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: uEmail, password: "Testpass1!", full_name: "WL" }) })).json();
  uid = ureg.id;
  const us = session(); await login(uEmail, us);
  const { data: prod } = await sb.from("products").select("id").eq("is_published", true).limit(1).maybeSingle();
  const pid = prod.id;
  const add = await fetch(`${BASE}/api/wishlist`, { method: "POST", headers: { "content-type": "application/json", cookie: us.cookie() }, body: JSON.stringify({ op: "add", product_id: pid }) });
  ok(add.ok, "wishlist add ok");
  const read = await (await fetch(`${BASE}/api/wishlist`, { headers: { cookie: us.cookie() } })).json();
  ok(read.ok && read.items.some((i) => i.product_id === pid), "wishlist read shows added item (persisted under nextauth)");
  ok(!!(await sb.from("wishlist_items").select("id").eq("user_id", uid).eq("product_id", pid).maybeSingle()).data, "wishlist item really in Supabase (RLS bypassed via service-role)");
  await fetch(`${BASE}/api/wishlist`, { method: "POST", headers: { "content-type": "application/json", cookie: us.cookie() }, body: JSON.stringify({ op: "remove", product_id: pid }) });
  const read2 = await (await fetch(`${BASE}/api/wishlist`, { headers: { cookie: us.cookie() } })).json();
  ok(!read2.items.some((i) => i.product_id === pid), "wishlist remove persisted");

  // ---- B) ADMIN ORDER STATUS via /api/admin/catalog/write ----
  const aEmail = `ord-${Date.now()}@example.com`;
  const areg = await (await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: aEmail, password: "Testpass1!", full_name: "Ord" }) })).json();
  aid = areg.id; await prisma.profiles.update({ where: { id: aid }, data: { role: "admin" } });
  const as = session(); await login(aEmail, as);
  const { data: order } = await sb.from("orders").select("id, status").limit(1).maybeSingle();
  orderId = order.id; origStatus = order.status;
  const newStatus = origStatus === "processing" ? "paid" : "processing";
  const upd = await fetch(`${BASE}/api/admin/catalog/write`, { method: "POST", headers: { "content-type": "application/json", cookie: as.cookie() }, body: JSON.stringify({ table: "orders", op: "update", data: { status: newStatus }, match: { id: orderId } }) });
  const ub = await upd.json().catch(() => ({}));
  ok(upd.ok && ub.ok, "admin order status update ok", JSON.stringify(ub));
  ok((await sb.from("orders").select("status").eq("id", orderId).maybeSingle()).data?.status === newStatus, "order status persisted in Supabase");
  ok((await prisma.orders.findUnique({ where: { id: orderId }, select: { status: true } }))?.status === newStatus, "order status mirrored to MySQL");
} catch (e) { fail++; console.error("ERROR:", e.message || e); }
finally {
  if (orderId && origStatus) { try { await sb.from("orders").update({ status: origStatus }).eq("id", orderId); await prisma.orders.update({ where: { id: orderId }, data: { status: origStatus } }); } catch {} }
  for (const id of [uid, aid]) if (id) { try { await sb.auth.admin.deleteUser(id); } catch {} try { await sb.from("wishlist_items").delete().eq("user_id", id); } catch {} try { await prisma.wishlist_items.deleteMany({ where: { user_id: id } }); } catch {} try { await prisma.profiles.deleteMany({ where: { id } }); } catch {} try { await prisma.user.deleteMany({ where: { id } }); } catch {} }
  await prisma.$disconnect();
  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ " + fail + " FAILED"} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}
