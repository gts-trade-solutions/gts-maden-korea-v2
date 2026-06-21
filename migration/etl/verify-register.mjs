// Read-only verifier for the dual-write register flow.
// Confirms an email exists in all FOUR stores with one matching id:
//   Supabase auth.users + public.profiles   AND   MySQL auth_users + profiles
// Run:  node migration/etl/verify-register.mjs <email>
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const EMAIL = (process.argv[2] || "").toLowerCase().trim();
if (!EMAIL) {
  console.error("usage: node migration/etl/verify-register.mjs <email>");
  process.exit(1);
}

const prisma = new PrismaClient();
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// 1) Supabase auth.users — independent lookup by email (small user base; one page).
const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const sbAuth = (list?.users || []).find(
  (u) => (u.email || "").toLowerCase() === EMAIL
) || null;

// 2) MySQL auth_users — independent lookup by email (Prisma model `user` → auth_users).
const myAuth = await prisma.user.findUnique({ where: { email: EMAIL } });

// Resolve id (prefer Supabase auth — register creates it first as canonical).
const id = sbAuth?.id || myAuth?.id || null;

// 3) Supabase public.profiles by id
let sbProfile = null;
if (id) {
  const { data } = await sb
    .from("profiles")
    .select("id, role, full_name, email_verified_at")
    .eq("id", id)
    .maybeSingle();
  sbProfile = data;
}

// 4) MySQL profiles by id
const myProfile = id
  ? await prisma.profiles.findUnique({ where: { id } })
  : null;

const yn = (v) => (v ? "✅" : "❌");
console.log(`\nEmail: ${EMAIL}`);
console.log("─".repeat(64));
console.log(`Supabase auth.users   ${yn(sbAuth)}  id=${sbAuth?.id ?? "—"}  confirmed=${sbAuth?.email_confirmed_at ? "yes" : "no"}`);
console.log(`Supabase profiles     ${yn(sbProfile)}  id=${sbProfile?.id ?? "—"}  role=${sbProfile?.role ?? "—"}`);
console.log(`MySQL auth_users      ${yn(myAuth)}  id=${myAuth?.id ?? "—"}  hash=${myAuth?.passwordHash ? "yes" : "no"}  name=${myAuth?.name ?? "—"}`);
console.log(`MySQL profiles        ${yn(myProfile)}  id=${myProfile?.id ?? "—"}  role=${myProfile?.role ?? "—"}`);
console.log("─".repeat(64));

const ids = [sbAuth?.id, sbProfile?.id, myAuth?.id, myProfile?.id].filter(Boolean);
const allFour = !!(sbAuth && sbProfile && myAuth && myProfile);
const allMatch = ids.length === 4 && ids.every((x) => x === ids[0]);
console.log(
  allFour && allMatch
    ? `RESULT: ✅ PASS — present in all 4 stores, single id ${ids[0]}`
    : `RESULT: ❌ INCOMPLETE — present ${ids.length}/4${allMatch ? "" : ", id MISMATCH: " + JSON.stringify([...new Set(ids)])}`
);

await prisma.$disconnect();
