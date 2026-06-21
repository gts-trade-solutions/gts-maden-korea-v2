/* eslint-disable no-console */
/**
 * One-shot loader for the `pincodes` table.
 *
 * Source: GeoNames postal codes for India (CC-BY 4.0).
 *   https://download.geonames.org/export/zip/IN.zip
 *
 * Steps before running:
 *   1. curl -O https://download.geonames.org/export/zip/IN.zip
 *      (or: Invoke-WebRequest -Uri ... -OutFile IN.zip on PowerShell)
 *   2. Extract IN.txt from the zip into the repo root (or anywhere; pass path as arg).
 *   3. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
 *      (loaded from .env / .env.local automatically).
 *   4. Run: npx tsx scripts/bootstrap-pincodes.ts [path/to/IN.txt]
 *
 * Zone assignment:
 *   - chennai_metro  : Haversine distance from Chennai GPO (13.0827N, 80.2707E) <= 50 km.
 *   - tamil_nadu     : state = Tamil Nadu (and not chennai_metro).
 *   - south_india    : Andhra Pradesh, Telangana, Karnataka, Kerala, Puducherry, Goa.
 *   - northeast      : Assam, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland,
 *                      Tripura, Sikkim.
 *   - islands        : Andaman & Nicobar Islands, Lakshadweep.
 *   - north_india    : everything else.
 *
 * Inserts in batches of 1000 with ON CONFLICT DO UPDATE so re-runs are idempotent.
 *
 * Attribution: pincode locality data sourced from GeoNames (https://www.geonames.org/),
 * licensed under CC-BY 4.0.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

// Load .env / .env.local without an extra dependency.
function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Chennai GPO. Haversine radius for chennai_metro zone.
const CHENNAI_LAT = 13.0827;
const CHENNAI_LON = 80.2707;
const METRO_RADIUS_KM = 50;

// State -> non-metro zone. Tamil Nadu rows that fail the radius check fall into tamil_nadu.
const SOUTH_STATES = new Set(
  [
    "Andhra Pradesh",
    "Telangana",
    "Karnataka",
    "Kerala",
    "Puducherry",
    "Pondicherry",
    "Goa",
  ].map((s) => s.toLowerCase()),
);

const NORTHEAST_STATES = new Set(
  [
    "Assam",
    "Arunachal Pradesh",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Tripura",
    "Sikkim",
  ].map((s) => s.toLowerCase()),
);

const ISLAND_STATES = new Set(
  ["Andaman and Nicobar Islands", "Andaman and Nicobar", "Lakshadweep"].map((s) =>
    s.toLowerCase(),
  ),
);

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function classifyZone(state: string, lat: number, lon: number): string {
  const stateLc = state.toLowerCase();
  const distance = haversineKm(CHENNAI_LAT, CHENNAI_LON, lat, lon);
  if (distance <= METRO_RADIUS_KM) return "chennai_metro";
  if (stateLc === "tamil nadu") return "tamil_nadu";
  if (SOUTH_STATES.has(stateLc)) return "south_india";
  if (NORTHEAST_STATES.has(stateLc)) return "northeast";
  if (ISLAND_STATES.has(stateLc)) return "islands";
  return "north_india";
}

type Row = {
  pincode: string;
  place_name: string;
  district: string | null;
  state: string;
  zone: string;
};

async function main() {
  const inputPath = process.argv[2] || path.resolve("IN.txt");
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    console.error(
      "Download https://download.geonames.org/export/zip/IN.zip, extract IN.txt, then re-run.",
    );
    process.exit(1);
  }

  console.log(`Reading: ${inputPath}`);
  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath, "utf8"),
    crlfDelay: Infinity,
  });

  // Pincode -> Row (last write wins for duplicate pincodes; GeoNames lists multiple
  // localities per pincode and we just need one place_name to display).
  const seen = new Map<string, Row>();
  let parsed = 0;

  for await (const line of rl) {
    if (!line) continue;
    const cols = line.split("\t");
    // GeoNames postal format columns:
    // 0 country, 1 postal_code, 2 place_name, 3 admin1, 4 admin1_code, 5 admin2 (district),
    // 6 admin2_code, 7 admin3, 8 admin3_code, 9 latitude, 10 longitude, 11 accuracy
    if (cols.length < 11) continue;
    const country = cols[0];
    if (country !== "IN") continue;

    const pincode = (cols[1] || "").trim();
    if (!/^\d{6}$/.test(pincode)) continue;

    const place_name = (cols[2] || "").trim();
    const state = (cols[3] || "").trim();
    const district = (cols[5] || "").trim() || null;
    const lat = parseFloat(cols[9]);
    const lon = parseFloat(cols[10]);

    if (!place_name || !state || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const zone = classifyZone(state, lat, lon);
    seen.set(pincode, { pincode, place_name, district, state, zone });
    parsed++;
  }

  const rows = Array.from(seen.values());
  console.log(
    `Parsed ${parsed} GeoNames lines -> ${rows.length} unique pincodes ready to upsert.`,
  );

  // Zone counts (sanity check before write).
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.zone] = (counts[r.zone] || 0) + 1;
  console.log("Zone distribution:", counts);

  // Bulk upsert in chunks. Supabase REST has a payload-size cap; 1000 rows is well within it.
  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await admin.from("pincodes").upsert(slice, { onConflict: "pincode" });
    if (error) {
      console.error(`Batch ${i}-${i + slice.length} failed:`, error.message);
      process.exit(1);
    }
    inserted += slice.length;
    if (inserted % 10000 === 0 || inserted === rows.length) {
      console.log(`  upserted ${inserted}/${rows.length}`);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
