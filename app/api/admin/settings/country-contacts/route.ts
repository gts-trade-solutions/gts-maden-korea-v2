export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import {
  bustBusinessInfoCache,
  listCountryContacts,
} from "@/lib/businessInfo";
import { isSupportedCountry } from "@/lib/countries";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const rows = await listCountryContacts();
  return json(jsonSafe({ ok: true, rows }));
}

/**
 * Replace-all upsert. Body shape:
 *   { rows: [{ countryCode, publicPhone, whatsappNumber, supportEmail,
 *              businessHours, publicAddress, isActive }, ...] }
 *
 * - Country codes are validated against SUPPORTED_COUNTRIES.
 * - Empty strings become NULL (= fall back to global default).
 * - Rows not present in the payload are DELETED (full replacement).
 *   Pass the existing rows back unchanged if you want to keep them.
 */
export async function PUT(req: Request) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const rows: any[] = Array.isArray(body?.rows) ? body.rows : [];

  // Validate + normalise
  const seen = new Set<string>();
  const cleaned: any[] = [];
  for (const r of rows) {
    const code = clean(r?.countryCode)?.toUpperCase();
    if (!code || !isSupportedCountry(code))
      return json({ ok: false, error: `Unsupported country code: ${r?.countryCode}` }, 400);
    if (seen.has(code))
      return json({ ok: false, error: `Duplicate country in payload: ${code}` }, 400);
    seen.add(code);
    cleaned.push({
      country_code: code,
      contact_name: clean(r.contactName),
      public_phone: clean(r.publicPhone),
      whatsapp_number: clean(r.whatsappNumber),
      support_email: clean(r.supportEmail),
      business_hours: clean(r.businessHours),
      public_address: clean(r.publicAddress),
      is_active: r.isActive === false ? false : true,
      updated_by: user!.id,
    });
  }

  // Single transaction: delete codes not in payload, upsert the rest.
  const codes = cleaned.map((r) => r.country_code);
  try {
    if (codes.length === 0) {
      // Caller submitted an empty list — wipe everything.
      await prisma.country_contacts.deleteMany({});
    } else {
      await prisma.country_contacts.deleteMany({
        where: { country_code: { notIn: codes } },
      });
      for (const row of cleaned) {
        const { country_code, ...rest } = row;
        await prisma.country_contacts.upsert({
          where: { country_code },
          update: rest,
          create: { country_code, ...rest },
        });
      }
    }
  } catch (upErr: any) {
    return json({ ok: false, error: upErr?.message ?? "Update failed" }, 500);
  }

  bustBusinessInfoCache();
  const fresh = await listCountryContacts();
  return json(jsonSafe({ ok: true, rows: fresh }));
}
