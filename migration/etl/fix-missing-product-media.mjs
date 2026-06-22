// Copy any product images that are referenced by the DB but missing from S3.
// Drives off the authoritative DB keys (product_images.storage_path +
// products.hero_image_path) — correct case — and fetches via the Supabase
// PUBLIC URL (the Storage list()/download() API returns wrong-case folder names
// for some folders, which is why migrate-storage.mjs skipped these). Idempotent:
// HEADs S3 first, uploads only what's missing.
//   Run:  AWS_PROFILE=security-admin node migration/etl/fix-missing-product-media.mjs
import { config } from "dotenv";
config({ path: ".env.local" }); config();
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = "product-media";
const S3_BUCKET = process.env.S3_BUCKET || "madenkorea-media";
const REGION = process.env.AWS_REGION || "ap-south-1";
const SB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
const s3 = new S3Client({ region: REGION });
const prisma = new PrismaClient();

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", mp4: "video/mp4", webm: "video/webm" };
const guess = (p) => MIME[(p.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
const encPath = (k) => k.split("/").map(encodeURIComponent).join("/");
const inS3 = async (key) => { try { await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key })); return true; } catch { return false; } };

const imgs = await prisma.product_images.findMany({ select: { storage_path: true } });
const heroes = await prisma.products.findMany({ select: { hero_image_path: true } });
await prisma.$disconnect();
const keys = [...new Set([...imgs.map((i) => i.storage_path), ...heroes.map((h) => h.hero_image_path)].filter((k) => k && k.trim() && !/^https?:\/\//i.test(k)))];
console.log(`Checking ${keys.length} distinct product image keys against s3://${S3_BUCKET}/${BUCKET}/ ...`);

let ok = 0, skip = 0, fail = 0, n = 0;
for (const k of keys) {
  n++;
  const s3key = `${BUCKET}/${k}`;
  if (await inS3(s3key)) { skip++; if (n % 50 === 0) console.log(`  ${n}/${keys.length} (ok ${ok}, skip ${skip}, fail ${fail})`); continue; }
  try {
    const res = await fetch(`${SB_BASE}/${encPath(k)}`);
    if (!res.ok) { console.log(`  MISS(${res.status}) ${k}`); fail++; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: s3key, Body: buf, ContentType: res.headers.get("content-type") || guess(k), CacheControl: "public, max-age=31536000, immutable" }));
    console.log(`  UPLOADED ${k} (${buf.length}b)`); ok++;
  } catch (e) { console.log(`  FAIL ${k} ${e.message}`); fail++; }
}
console.log(`\nDONE — uploaded ${ok}, skipped(existing) ${skip}, missing-from-supabase ${fail}, total ${keys.length}`);
