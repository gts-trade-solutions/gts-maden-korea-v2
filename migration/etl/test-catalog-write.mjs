// Prove the generic /api/admin/catalog/write endpoint: insert -> update -> delete
// a throwaway brand, verifying each step lands in BOTH MySQL and Supabase (so CMS
// saves persist under NextAuth). Self-cleaning.
// Run: node migration/etl/test-catalog-write.mjs http://localhost:3000
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = `cwrite-${Date.now()}@example.com`;
const SLUG = `qa-test-brand-${Date.now()}`;
const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const jar = {};
const stash = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); } };
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
const write = async (payload) => { const r = await fetch(`${BASE}/api/admin/catalog/write`, { method: "POST", headers: { "content-type": "application/json", cookie: cookie() }, body: JSON.stringify(payload) }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
let pass = 0, fail = 0;
const ok = (c, label, extra = "") => { c ? (pass++, console.log(`✅ ${label}`)) : (fail++, console.log(`❌ ${label} ${extra}`)); };

let id = null, brandId = null;
try {
  const reg = await (await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: "Testpass1!", full_name: "CW" }) })).json();
  id = reg.id; if (!id) throw new Error("register failed");
  await prisma.profiles.update({ where: { id }, data: { role: "admin" } });
  const csrf = await (await (async () => { const r = await fetch(`${BASE}/api/auth/csrf`); stash(r); return r; })()).json();
  stash(await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: "Testpass1!", json: "true" }).toString(), redirect: "manual" }));

  // INSERT
  const ins = await write({ table: "brands", op: "insert", data: { name: "QA Test Brand", slug: SLUG, active: true, position: 999 } });
  brandId = ins?.row?.id;
  ok(ins.status === 200 && ins.ok && brandId, "insert brand -> row returned", JSON.stringify(ins).slice(0, 160));
  ok(!!(await prisma.brands.findUnique({ where: { id: brandId || "x" } })), "insert landed in MySQL");
  ok(!!(await sb.from("brands").select("id").eq("id", brandId).maybeSingle()).data, "insert landed in Supabase");

  // UPDATE
  const upd = await write({ table: "brands", op: "update", data: { name: "QA Renamed" }, match: { id: brandId } });
  ok(upd.ok, "update brand ok");
  const myName = (await prisma.brands.findUnique({ where: { id: brandId }, select: { name: true } }))?.name;
  ok(myName === "QA Renamed", "update persisted in MySQL", `got ${myName}`);
  const sbName = (await sb.from("brands").select("name").eq("id", brandId).maybeSingle()).data?.name;
  ok(sbName === "QA Renamed", "update persisted in Supabase", `got ${sbName}`);

  // DELETE
  const del = await write({ table: "brands", op: "delete", match: { id: brandId } });
  ok(del.ok, "delete brand ok");
  ok(!(await prisma.brands.findUnique({ where: { id: brandId } })), "delete removed from MySQL");
  ok(!(await sb.from("brands").select("id").eq("id", brandId).maybeSingle()).data, "delete removed from Supabase");
  brandId = null;
} catch (e) {
  fail++; console.error("ERROR:", e.message || e);
} finally {
  if (brandId) { try { await sb.from("brands").delete().eq("id", brandId); } catch {} try { await prisma.brands.delete({ where: { id: brandId } }); } catch {} }
  if (id) { try { await sb.auth.admin.deleteUser(id); } catch {} try { await prisma.profiles.deleteMany({ where: { id } }); } catch {} try { await prisma.user.deleteMany({ where: { id } }); } catch {} }
  await prisma.$disconnect();
  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ " + fail + " FAILED"} (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}
