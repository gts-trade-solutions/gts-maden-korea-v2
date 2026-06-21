// Migrate Supabase Storage -> S3. Copies every object from the 5 public buckets
// into s3://<S3_BUCKET>/<supabase-bucket>/<path>, preserving content-type, with a
// long cache-control. Idempotent + resumable (skips objects already in S3).
// Run:  AWS_PROFILE=security-admin node migration/etl/migrate-storage.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const S3_BUCKET = process.env.S3_BUCKET || "madenkorea-media";
const REGION = process.env.AWS_REGION || "ap-south-1";
const SOURCE_BUCKETS = ["product-media", "site-assets", "review-media", "facebook-media", "product-story-media"];
const CONCURRENCY = 8;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// No explicit credentials → default chain (honors AWS_PROFILE=security-admin).
const s3 = new S3Client({ region: REGION });

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", mp4: "video/mp4", ogg: "video/ogg", webm: "video/webm", svg: "image/svg+xml" };
const guessType = (path) => MIME[(path.split(".").pop() || "").toLowerCase()] || "application/octet-stream";

async function listAll(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) { console.error(`list ${bucket}/${prefix}:`, error.message); break; }
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) out.push(...(await listAll(bucket, path)));
      else if (item.name !== ".emptyFolderPlaceholder") out.push({ bucket, path });
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function existsInS3(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key })); return true; } catch { return false; }
}

async function migrateOne(f) {
  const key = `${f.bucket}/${f.path}`;
  if (await existsInS3(key)) return "skip";
  const { data: blob, error } = await sb.storage.from(f.bucket).download(f.path);
  if (error || !blob) { console.error("  download FAIL", key, error?.message); return "fail"; }
  const buf = Buffer.from(await blob.arrayBuffer());
  const contentType = blob.type && blob.type !== "application/octet-stream" ? blob.type : guessType(f.path);
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET, Key: key, Body: buf, ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return "ok";
}

async function pool(items, n, fn) {
  let i = 0;
  const counts = { ok: 0, skip: 0, fail: 0 };
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const r = await fn(items[idx]).catch((e) => { console.error("  PUT FAIL", `${items[idx].bucket}/${items[idx].path}`, e.message); return "fail"; });
      counts[r]++;
      const done = counts.ok + counts.skip + counts.fail;
      if (done % 25 === 0 || done === items.length) console.log(`  ${done}/${items.length}  (ok ${counts.ok}, skip ${counts.skip}, fail ${counts.fail})`);
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return counts;
}

console.log(`Migrating Supabase -> s3://${S3_BUCKET} (${REGION})`);
let all = [];
for (const b of SOURCE_BUCKETS) {
  const files = await listAll(b);
  console.log(`  ${b}: ${files.length} files`);
  all = all.concat(files);
}
console.log(`TOTAL to process: ${all.length}\n`);

const counts = await pool(all, CONCURRENCY, migrateOne);
console.log("\n" + "─".repeat(50));
console.log(`DONE — uploaded ${counts.ok}, skipped(existing) ${counts.skip}, failed ${counts.fail}, total ${all.length}`);
if (counts.fail > 0) process.exitCode = 1;
