// Server-side proof that NextAuth can authenticate a (dual-write) account and
// stamp the role into the JWT — WITHOUT flipping the global AUTH_BACKEND flag
// (NextAuth's /api/auth/* endpoints are always mounted). Self-cleaning.
//
//   register throwaway -> NextAuth csrf -> credentials callback -> /session
//
// Run:  node migration/etl/test-nextauth-login.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] || "http://localhost:3001"; // actual dev server
const EMAIL = `na-test-${Date.now()}@example.com`;
const PASSWORD = "Testpass1!";

const prisma = new PrismaClient();
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// minimal cookie jar over fetch
const jar = {};
const stash = (res) => {
  const sc = res.headers.getSetCookie?.() || [];
  for (const c of sc) {
    const kv = c.split(";")[0];
    const i = kv.indexOf("=");
    if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1);
  }
};
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

let id = null;
try {
  // 1) register throwaway (dual-write)
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, full_name: "NA Test" }),
  });
  const regBody = await reg.json();
  id = regBody.id;
  console.log(`1) register     -> ${reg.status} ${JSON.stringify(regBody)}`);
  if (!id) throw new Error("register did not return an id");

  // 2) NextAuth csrf (sets csrf cookie)
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  stash(csrfRes);
  const { csrfToken } = await csrfRes.json();
  console.log(`2) csrf         -> ${csrfRes.status} token:${csrfToken ? "yes" : "no"}`);

  // 3) credentials callback (sets session cookie on success)
  const form = new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, json: "true" });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: form.toString(),
    redirect: "manual",
  });
  stash(loginRes);
  const hasSession = Object.keys(jar).some((k) => k.includes("session-token"));
  console.log(`3) credentials  -> ${loginRes.status} session-cookie:${hasSession ? "yes" : "no"}`);

  // 4) session — should carry id + role
  const sessRes = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookie() } });
  const session = await sessRes.json();
  console.log(`4) session      -> ${sessRes.status} ${JSON.stringify(session)}`);

  const ok = session?.user?.email === EMAIL && !!session?.user?.id;
  console.log("─".repeat(60));
  console.log(
    ok
      ? `✅ PASS — NextAuth authenticated the bcrypt hash. user=${session.user.email} role=${session.user.role} id=${session.user.id}`
      : `❌ FAIL — no NextAuth session for ${EMAIL} (check NEXTAUTH_URL port + NEXTAUTH_SECRET)`
  );
} finally {
  // cleanup — remove the throwaway from all stores
  if (id) {
    try { await sb.auth.admin.deleteUser(id); } catch (e) { console.error("cleanup sb:", e.message); }
    try { await prisma.profiles.delete({ where: { id } }); } catch {}
    try { await prisma.user.delete({ where: { id } }); } catch {}
    console.log(`cleaned up throwaway ${id}`);
  }
  await prisma.$disconnect();
}
