export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  SUPPORTED_COUNTRIES,
  isSupportedCountry,
} from "@/lib/countries";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { STORAGE_BACKEND } from "@/lib/storage/backend";
import { mirrorTableToMysql } from "@/lib/data/mirror";

// Admin CRUD for the K-Partnership "How it works" videos. Per-country
// rows in `k_partnership_videos`, plus a singleton default country
// pointer on `store_settings.k_partnership_default_country`.
//
// Methods:
//   GET    — return all rows + the default country code
//   POST   — multipart upload: { country_code, file } → uploads to
//             site-assets/k-partnership/<country>.<ext> and upserts
//             the table row
//   DELETE — ?country=XX → removes the row + the storage file
//   PATCH  — body { default_country } → updates the default country

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const BUCKET = "site-assets";
const PATH_PREFIX = "k-partnership";


function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const sb = admin();
  const [{ data: videos, error: vErr }, { data: settings }] = await Promise.all([
    sb
      .from("k_partnership_videos")
      .select("country_code, storage_path, updated_at")
      .order("country_code"),
    sb
      .from("store_settings")
      .select("k_partnership_default_country")
      .eq("id", 1)
      .maybeSingle<{ k_partnership_default_country: string | null }>(),
  ]);

  if (vErr) return json({ ok: false, error: vErr.message }, 500);

  return json({
    ok: true,
    videos: videos ?? [],
    default_country: settings?.k_partnership_default_country ?? null,
    supported_countries: SUPPORTED_COUNTRIES,
  });
}

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  // The browser uploads the video file DIRECTLY to Supabase storage
  // (using the admin's authenticated session — RLS already allows
  // authenticated INSERT to `site-assets`). This route only registers
  // the storage path in the `k_partnership_videos` table.
  //
  // Why not accept the file here? Netlify functions cap synchronous
  // request bodies at ~6 MB. Video uploads commonly exceed that and
  // were producing 500s. Routing the bytes through Supabase's own
  // upload protocol avoids the function-body limit entirely.
  const body = await req.json().catch(() => ({}));
  const countryCode = String(body?.country_code ?? "").toUpperCase();
  const storagePath = String(body?.storage_path ?? "").trim();

  if (!isSupportedCountry(countryCode)) {
    return json({ ok: false, error: "UNSUPPORTED_COUNTRY" }, 400);
  }
  if (!storagePath.startsWith(`${PATH_PREFIX}/`)) {
    // Hard-constrain the path so a forged request can't redirect the
    // row at an arbitrary file in the bucket.
    return json({ ok: false, error: "BAD_STORAGE_PATH" }, 400);
  }

  const sb = admin();

  // Verify the file exists in storage before we point a DB row at
  // it. Cheap stat — saves a future 404 for storefront visitors if
  // the browser-side upload failed silently and the client called
  // POST anyway.
  let fileExists = false;
  if (STORAGE_BACKEND === "s3") {
    const { s3Exists } = await import("@/lib/storage/s3");
    fileExists = await s3Exists(`${BUCKET}/${storagePath}`);
  } else {
    const { data: list, error: listErr } = await sb.storage
      .from(BUCKET)
      .list(PATH_PREFIX, { limit: 100, search: storagePath.split("/").pop() });
    if (listErr) return json({ ok: false, error: listErr.message }, 500);
    const expectedName = storagePath.replace(`${PATH_PREFIX}/`, "");
    fileExists = (list ?? []).some((f) => f.name === expectedName);
  }
  if (!fileExists) {
    return json({ ok: false, error: "FILE_NOT_FOUND_IN_STORAGE" }, 400);
  }

  // Upsert the table row pointing at the uploaded file.
  const { error: dbErr } = await sb
    .from("k_partnership_videos")
    .upsert(
      { country_code: countryCode, storage_path: storagePath, updated_at: new Date().toISOString() },
      { onConflict: "country_code" }
    );
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);

  // Dual-write: mirror k_partnership_videos into MySQL (storefront reads it).
  await mirrorTableToMysql("k_partnership_videos").catch(() => {});

  return json({ ok: true, country_code: countryCode, storage_path: storagePath });
}

export async function DELETE(req: NextRequest) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const url = new URL(req.url);
  const countryCode = (url.searchParams.get("country") ?? "").toUpperCase();
  if (!isSupportedCountry(countryCode)) {
    return json({ ok: false, error: "UNSUPPORTED_COUNTRY" }, 400);
  }

  const sb = admin();

  // Look up the path so we can remove the storage file too.
  const { data: existing } = await sb
    .from("k_partnership_videos")
    .select("storage_path")
    .eq("country_code", countryCode)
    .maybeSingle<{ storage_path: string }>();

  // Delete the row first (RLS would block anon read after; doesn't
  // matter for storage cleanup). Then remove the file. Order doesn't
  // affect correctness because the storefront tolerates missing rows.
  const { error: delErr } = await sb
    .from("k_partnership_videos")
    .delete()
    .eq("country_code", countryCode);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);

  if (existing?.storage_path) {
    if (STORAGE_BACKEND === "s3") {
      const { s3Delete } = await import("@/lib/storage/s3");
      await s3Delete(`${BUCKET}/${existing.storage_path}`).catch(() => {});
    } else {
      await sb.storage.from(BUCKET).remove([existing.storage_path]);
    }
  }

  // If the deleted country was the default, clear the pointer so the
  // storefront falls through to "no video" instead of pointing at a
  // now-deleted row.
  const { data: settings } = await sb
    .from("store_settings")
    .select("k_partnership_default_country")
    .eq("id", 1)
    .maybeSingle<{ k_partnership_default_country: string | null }>();
  if (settings?.k_partnership_default_country === countryCode) {
    await sb
      .from("store_settings")
      .update({ k_partnership_default_country: null })
      .eq("id", 1);
  }

  await mirrorTableToMysql("k_partnership_videos").catch(() => {});
  await mirrorTableToMysql("store_settings").catch(() => {});

  return json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const defaultCountry: string | null =
    body?.default_country == null
      ? null
      : String(body.default_country).toUpperCase();

  if (defaultCountry !== null && !isSupportedCountry(defaultCountry)) {
    return json({ ok: false, error: "UNSUPPORTED_COUNTRY" }, 400);
  }

  const sb = admin();

  // If setting a non-null default, ensure that country actually has
  // a video row — otherwise the storefront's fallback resolves to
  // nothing, which is confusing.
  if (defaultCountry !== null) {
    const { data: row } = await sb
      .from("k_partnership_videos")
      .select("country_code")
      .eq("country_code", defaultCountry)
      .maybeSingle();
    if (!row) {
      return json(
        { ok: false, error: "DEFAULT_COUNTRY_HAS_NO_VIDEO", country: defaultCountry },
        400
      );
    }
  }

  const { error: dbErr } = await sb
    .from("store_settings")
    .update({ k_partnership_default_country: defaultCountry })
    .eq("id", 1);
  if (dbErr) return json({ ok: false, error: dbErr.message }, 500);

  await mirrorTableToMysql("store_settings").catch(() => {});

  return json({ ok: true, default_country: defaultCountry });
}
