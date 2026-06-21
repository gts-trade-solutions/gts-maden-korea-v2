// Prove the admin API works for an authenticated ADMIN under NextAuth:
// register -> make admin (MySQL profiles, read by the jwt callback) -> nextauth
// login -> GET admin routes -> expect 200 + data. Self-cleaning.
// Run (server flipped to nextauth): node migration/etl/test-admin-nextauth.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = `admin-test-${Date.now()}@example.com`;
const PASSWORD = "Testpass1!";
const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const jar = {};
const stash = (res) => { for (const c of res.headers.getSetCookie?.() || []) { const kv = c.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); } };
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

let id = null;
try {
  // register
  const reg = await (await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PASSWORD, full_name: "Admin Test" }) })).json();
  id = reg.id;
  console.log(`register: ${id ? "ok" : JSON.stringify(reg)}`);
  if (!id) throw new Error("register failed");

  // promote to admin BEFORE login (jwt callback reads MySQL profiles.role at sign-in)
  await prisma.profiles.update({ where: { id }, data: { role: "admin" } });
  try { await sb.from("profiles").update({ role: "admin" }).eq("id", id); } catch {}
  console.log("promoted to admin (MySQL + Supabase profiles)");

  // nextauth login
  const csrf = await (await (async () => { const r = await fetch(`${BASE}/api/auth/csrf`); stash(r); return r; })()).json();
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: PASSWORD, json: "true" }).toString(), redirect: "manual" });
  stash(loginRes);

  // session should carry role=admin
  const session = await (await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookie() } })).json();
  console.log(`session role: ${session?.user?.role}`);

  // hit the admin routes
  const hit = async (path) => {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie: cookie() }, cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    const count = Array.isArray(j?.vendors) ? j.vendors.length : Array.isArray(j?.requests) ? j.requests.length : Array.isArray(j?.payouts) ? j.payouts.length : "—";
    console.log(`  GET ${path} -> ${res.status} ok=${j?.ok} count=${count}`);
    return res.status === 200 && j?.ok;
  };
  const a = await hit("/api/admin/vendors");
  const b = await hit("/api/admin/influencers/requests");
  const c = await hit("/api/admin/influencers/payouts");

  console.log("─".repeat(56));
  console.log(session?.user?.role === "admin" && a && b && c
    ? "✅ PASS — admin authenticated via NextAuth JWT role; all admin routes returned data"
    : `❌ FAIL — role=${session?.user?.role}, vendors=${a}, requests=${b}, payouts=${c}`);
} catch (e) {
  console.error("ERROR:", e.message || e);
} finally {
  if (id) {
    try { await sb.auth.admin.deleteUser(id); } catch {}
    try { await prisma.profiles.delete({ where: { id } }); } catch {}
    try { await prisma.user.delete({ where: { id } }); } catch {}
    console.log(`cleaned up ${id}`);
  }
  await prisma.$disconnect();
}
