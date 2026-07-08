export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import {
  SUPPORTED_COUNTRIES,
  isSupportedCountry,
} from "@/lib/countries";
import { requireAdmin } from "@/lib/auth/adminGuard";

// Admin CRUD for the K-Partnership "How it works" videos. Per-country
// rows in `k_partnership_videos`, plus a singleton default country
// pointer on `store_settings.k_partnership_default_country`. Reads +
// writes go directly to MySQL (Prisma); the video files live in S3.
//
// Methods:
//   GET    — return all rows + the default country code
//   POST   — { country_code, storage_path } → verifies the already-uploaded
//             S3 object and upserts the table row
//   DELETE — ?country=XX → removes the row + the S3 file
//   PATCH  — body { default_country } → updates the default country

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

const BUCKET = "site-assets";
const PATH_PREFIX = "k-partnership";

export async function GET() {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  const [videos, settings] = await Promise.all([
    prisma.k_partnership_videos.findMany({
      select: { country_code: true, storage_path: true, updated_at: true },
      orderBy: { country_code: "asc" },
    }),
    prisma.store_settings.findFirst({
      select: { k_partnership_default_country: true },
    }),
  ]);

  return json({
    ok: true,
    videos: jsonSafe(videos),
    default_country: settings?.k_partnership_default_country ?? null,
    supported_countries: SUPPORTED_COUNTRIES,
  });
}

export async function POST(req: NextRequest) {
  const { error: authErr } = await requireAdmin();
  if (authErr) return authErr;

  // The browser uploads the video file directly to S3 first; this route only
  // registers the storage path in the `k_partnership_videos` table.
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

  // Verify the file exists in S3 before pointing a DB row at it.
  const { s3Exists } = await import("@/lib/storage/s3");
  const fileExists = await s3Exists(`${BUCKET}/${storagePath}`);
  if (!fileExists) {
    return json({ ok: false, error: "FILE_NOT_FOUND_IN_STORAGE" }, 400);
  }

  try {
    await prisma.k_partnership_videos.upsert({
      where: { country_code: countryCode },
      create: { country_code: countryCode, storage_path: storagePath, updated_at: new Date() },
      update: { storage_path: storagePath, updated_at: new Date() },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WRITE_FAILED" }, 500);
  }

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

  // Look up the path so we can remove the S3 file too.
  const existing = await prisma.k_partnership_videos.findUnique({
    where: { country_code: countryCode },
    select: { storage_path: true },
  });

  // deleteMany = silent no-op when the row is absent (matches the old
  // Supabase delete semantics; Prisma delete would throw P2025).
  await prisma.k_partnership_videos.deleteMany({ where: { country_code: countryCode } });

  if (existing?.storage_path) {
    const { s3Delete } = await import("@/lib/storage/s3");
    await s3Delete(`${BUCKET}/${existing.storage_path}`).catch(() => {});
  }

  // If the deleted country was the default, clear the pointer.
  const settings = await prisma.store_settings.findFirst({
    select: { k_partnership_default_country: true },
  });
  if (settings?.k_partnership_default_country === countryCode) {
    await prisma.store_settings.update({
      where: { id: 1 },
      data: { k_partnership_default_country: null },
    });
  }

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

  // If setting a non-null default, ensure that country actually has a video row.
  if (defaultCountry !== null) {
    const row = await prisma.k_partnership_videos.findUnique({
      where: { country_code: defaultCountry },
      select: { country_code: true },
    });
    if (!row) {
      return json(
        { ok: false, error: "DEFAULT_COUNTRY_HAS_NO_VIDEO", country: defaultCountry },
        400
      );
    }
  }

  try {
    await prisma.store_settings.update({
      where: { id: 1 },
      data: { k_partnership_default_country: defaultCountry },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WRITE_FAILED" }, 500);
  }

  return json({ ok: true, default_country: defaultCountry });
}
