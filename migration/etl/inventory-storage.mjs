// Inventory Supabase Storage: buckets, file counts, total size, sample paths.
// Read-only. Run: node migration/etl/inventory-storage.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function listAll(bucket, prefix = "") {
  const out = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await sb.storage
      .from(bucket)
      .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
    if (error) {
      console.error(`  list ${bucket}/${prefix} error:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (!item.id) {
        // folder (Supabase returns id=null for folders) → recurse
        out.push(...(await listAll(bucket, path)));
      } else {
        out.push({ path, size: item.metadata?.size ?? 0, mimetype: item.metadata?.mimetype ?? "" });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

const { data: buckets, error: bErr } = await sb.storage.listBuckets();
if (bErr) {
  console.error("listBuckets error:", bErr.message);
  process.exit(1);
}
console.log(
  "Buckets:",
  (buckets ?? []).map((b) => `${b.name}${b.public ? " [public]" : " [private]"}`).join(", ") || "(none)"
);

let grandFiles = 0;
let grandBytes = 0;
for (const b of buckets ?? []) {
  const files = await listAll(b.name);
  const bytes = files.reduce((s, f) => s + (f.size || 0), 0);
  grandFiles += files.length;
  grandBytes += bytes;
  const exts = {};
  for (const f of files) {
    const m = (f.path.split(".").pop() || "?").toLowerCase();
    exts[m] = (exts[m] || 0) + 1;
  }
  console.log(`\n=== ${b.name} (${b.public ? "public" : "private"}) ===`);
  console.log(`  files: ${files.length} | size: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ext breakdown: ${JSON.stringify(exts)}`);
  console.log(`  sample paths:`);
  files.slice(0, 6).forEach((f) => console.log(`    ${f.path}  (${f.size}b ${f.mimetype})`));
}
console.log(`\nTOTAL: ${grandFiles} files, ${(grandBytes / 1024 / 1024).toFixed(2)} MB across ${(buckets ?? []).length} buckets`);
