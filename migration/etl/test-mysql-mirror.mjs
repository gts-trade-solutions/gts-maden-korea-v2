// Test the generic /api/admin/mysql-mirror endpoint: register admin -> login ->
// mirror a few tables -> verify MySQL count matches Supabase. Self-cleaning.
// Run: node migration/etl/test-mysql-mirror.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = `mirror-${Date.now()}@example.com`;
const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const jar = {};
const stash = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); } };
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

let id = null;
try {
  const reg = await (await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: "Testpass1!", full_name: "Mirror" }) })).json();
  id = reg.id; if (!id) throw new Error("register failed");
  await prisma.profiles.update({ where: { id }, data: { role: "admin" } });
  const csrf = await (await (async () => { const r = await fetch(`${BASE}/api/auth/csrf`); stash(r); return r; })()).json();
  stash(await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: "Testpass1!", json: "true" }).toString(), redirect: "manual" }));

  const mirror = async (table, scopeVal) => {
    const res = await fetch(`${BASE}/api/admin/mysql-mirror`, { method: "POST", headers: { "content-type": "application/json", cookie: cookie() }, body: JSON.stringify({ table, scopeVal }) });
    const j = await res.json().catch(() => ({}));
    return { status: res.status, ...j };
  };

  // full-table mirrors + count check vs Supabase
  for (const table of ["brands", "categories", "home_banners", "home_product_videos", "home_influencer_videos", "store_settings"]) {
    const r = await mirror(table);
    const { count: sbCount } = await sb.from(table).select("*", { count: "exact", head: true });
    const myCount = await (prisma)[table].count();
    const ok = r.ok && myCount === sbCount;
    console.log(`${ok ? "✅" : "❌"} ${table.padEnd(24)} mirror=${r.status}/${r.ok} synced=${r.synced} | supabase=${sbCount} mysql=${myCount}`);
  }

  // a scoped mirror (the ₹399 product's country prices)
  const PID = "550f38c0-bf15-487d-8331-1308005c4739";
  const r = await mirror("product_country_prices", PID);
  const { count: sbN } = await sb.from("product_country_prices").select("*", { count: "exact", head: true }).eq("product_id", PID);
  const myN = await prisma.product_country_prices.count({ where: { product_id: PID } });
  console.log(`${r.ok && myN === sbN ? "✅" : "❌"} product_country_prices[scoped] mirror=${r.status}/${r.ok} synced=${r.synced} | supabase=${sbN} mysql=${myN}`);
} catch (e) {
  console.error("ERROR:", e.message || e);
} finally {
  if (id) { try { await sb.auth.admin.deleteUser(id); } catch {} try { await prisma.profiles.delete({ where: { id } }); } catch {} try { await prisma.user.delete({ where: { id } }); } catch {} }
  await prisma.$disconnect();
}
