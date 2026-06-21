// Phase-1 proof: the admin products list now READS from MySQL and its WRITE
// (featured toggle) persists under NextAuth — the exact QA bug. Self-cleaning.
// Run: node migration/etl/test-admin-catalog.mjs http://localhost:3000
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = `catalog-${Date.now()}@example.com`;
const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const jar = {};
const stash = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); } };
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
let pass = 0, fail = 0;
const ok = (c, label, extra = "") => { c ? (pass++, console.log(`✅ ${label}`)) : (fail++, console.log(`❌ ${label} ${extra}`)); };

let id = null, prodId = null, original = null;
try {
  const reg = await (await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: "Testpass1!", full_name: "Catalog" }) })).json();
  id = reg.id; if (!id) throw new Error("register failed");
  await prisma.profiles.update({ where: { id }, data: { role: "admin" } });
  const csrf = await (await (async () => { const r = await fetch(`${BASE}/api/auth/csrf`); stash(r); return r; })()).json();
  stash(await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: "Testpass1!", json: "true" }).toString(), redirect: "manual" }));

  // 1) GET reads from MySQL
  const g = await fetch(`${BASE}/api/admin/catalog/products`, { headers: { cookie: cookie() } });
  const gd = await g.json().catch(() => ({}));
  ok(g.status === 200 && gd?.ok && Array.isArray(gd.products) && gd.products.length > 0, "GET /api/admin/catalog/products reads products from MySQL", `status=${g.status} n=${gd?.products?.length}`);

  // 2) Pick a product, toggle is_featured via POST, verify it PERSISTS (the QA bug)
  prodId = gd.products[0].id;
  original = !!gd.products[0].is_featured;
  const target = !original;
  const p = await fetch(`${BASE}/api/admin/catalog/products`, { method: "POST", headers: { "content-type": "application/json", cookie: cookie() }, body: JSON.stringify({ op: "updateFields", id: prodId, data: { is_featured: target } }) });
  const pd = await p.json().catch(() => ({}));
  ok(p.status === 200 && pd?.ok, "POST updateFields returns ok", JSON.stringify(pd));

  // 3) Verify it actually changed in BOTH MySQL and Supabase (dual-write worked)
  const myRow = await prisma.products.findUnique({ where: { id: prodId }, select: { is_featured: true } });
  ok(!!myRow?.is_featured === target, "MySQL is_featured persisted to new value", `expected ${target} got ${myRow?.is_featured}`);
  const { data: sbRow } = await sb.from("products").select("is_featured").eq("id", prodId).maybeSingle();
  ok(!!sbRow?.is_featured === target, "Supabase is_featured also updated (dual-write)", `expected ${target} got ${sbRow?.is_featured}`);

  // 4) Re-GET confirms the admin list now shows the persisted value (no revert)
  const g2 = await fetch(`${BASE}/api/admin/catalog/products`, { headers: { cookie: cookie() } });
  const gd2 = await g2.json().catch(() => ({}));
  const reread = gd2.products?.find((x) => x.id === prodId);
  ok(!!reread && !!reread.is_featured === target, "re-GET shows persisted value (no revert)", `got ${reread?.is_featured}`);
} catch (e) {
  fail++; console.error("ERROR:", e.message || e);
} finally {
  // revert the product + cleanup admin
  if (prodId && original !== null) { try { await sb.from("products").update({ is_featured: original }).eq("id", prodId); } catch {} try { await prisma.products.update({ where: { id: prodId }, data: { is_featured: original } }); } catch {} }
  if (id) { try { await sb.auth.admin.deleteUser(id); } catch {} try { await prisma.profiles.deleteMany({ where: { id } }); } catch {} try { await prisma.user.deleteMany({ where: { id } }); } catch {} }
  await prisma.$disconnect();
  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ " + fail + " FAILED"} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}
