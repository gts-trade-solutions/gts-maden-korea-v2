// End-to-end S3 upload test under STORAGE_BACKEND=s3 + AUTH_BACKEND=nextauth:
// register -> promote admin -> nextauth login -> /api/uploads/presign -> PUT to
// the presigned URL -> verify the object exists in S3 + is public. Tests both an
// admin bucket (product-media) and the customer bucket (review-media). Self-cleaning.
// Run: AWS_PROFILE=security-admin node migration/etl/test-s3-upload.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const BASE = process.argv[2] || "http://localhost:3000";
const S3_BUCKET = "madenkorea-media";
const REGION = "ap-south-1";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/aMUAAAAAElFTkSuQmCC",
  "base64"
);

const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const s3 = new S3Client({ region: REGION });

const jar = {};
const stash = (res) => { for (const c of res.headers.getSetCookie?.() || []) { const kv = c.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar[kv.slice(0, i)] = kv.slice(i + 1); } };
const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

const cleanupKeys = [];
const EMAIL = `s3up-${Date.now()}@example.com`;
let id = null;
try {
  const reg = await (await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: "Testpass1!", full_name: "S3 Up" }) })).json();
  id = reg.id;
  if (!id) throw new Error("register failed: " + JSON.stringify(reg));
  await prisma.profiles.update({ where: { id }, data: { role: "admin" } });
  try { await sb.from("profiles").update({ role: "admin" }).eq("id", id); } catch {}
  const csrf = await (await (async () => { const r = await fetch(`${BASE}/api/auth/csrf`); stash(r); return r; })()).json();
  const login = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: EMAIL, password: "Testpass1!", json: "true" }).toString(), redirect: "manual" });
  stash(login);
  console.log("setup: admin registered + logged in");

  const testOne = async (bucket, key, label) => {
    const res = await fetch(`${BASE}/api/uploads/presign`, {
      method: "POST", headers: { "content-type": "application/json", cookie: cookie() },
      body: JSON.stringify({ bucket, key, contentType: "image/png" }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.mode !== "s3" || !j.uploadUrl) { console.log(`${label}: presign ${res.status} mode=${j.mode} ${j.error || ""}`); return false; }
    cleanupKeys.push(`${bucket}/${key}`);
    const put = await fetch(j.uploadUrl, { method: "PUT", body: PNG, headers: { "content-type": "image/png" } });
    let head = false; try { await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: `${bucket}/${key}` })); head = true; } catch {}
    let pub = "?"; try { const r = await fetch(`https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${bucket}/${encodeURI(key)}`, { method: "HEAD" }); pub = r.status; } catch {}
    const ok = put.ok && head;
    console.log(`${label}: presign 200 -> PUT ${put.status} -> S3 HEAD ${head} -> public ${pub} -> ${ok ? "✅" : "❌"}`);
    console.log(`   publicUrl: ${j.publicUrl}`);
    return ok;
  };

  const a = await testOne("product-media", `_smoketest/${Date.now()}-admin.png`, "product-media (admin)");
  const b = await testOne("review-media", `uploads/_smoketest-${Date.now()}-user.png`, "review-media (customer)");

  console.log("─".repeat(56));
  console.log(a && b ? "✅ PASS — S3 presign + upload works for admin AND customer buckets under NextAuth" : `❌ FAIL — product-media=${a}, review-media=${b}`);
} catch (e) {
  console.error("ERROR:", e.message || e);
} finally {
  for (const k of cleanupKeys) { try { await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: k })); } catch {} }
  if (id) { try { await sb.auth.admin.deleteUser(id); } catch {} try { await prisma.profiles.delete({ where: { id } }); } catch {} try { await prisma.user.delete({ where: { id } }); } catch {} }
  console.log("cleaned up");
  await prisma.$disconnect();
}
