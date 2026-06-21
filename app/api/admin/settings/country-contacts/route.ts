export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
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
  return json({ ok: true, rows });
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
  const supabase = createAdminClient();

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
  if (codes.length === 0) {
    // Caller submitted an empty list — wipe everything.
    const { error: delErr } = await supabase
      .from("country_contacts")
      .delete()
      .gte("country_code", "");
    if (delErr) return json({ ok: false, error: delErr.message }, 500);
  } else {
    const { error: delErr } = await supabase
      .from("country_contacts")
      .delete()
      .not("country_code", "in", `(${codes.map((c) => `"${c}"`).join(",")})`);
    if (delErr) return json({ ok: false, error: delErr.message }, 500);

    const { error: upErr } = await supabase
      .from("country_contacts")
      .upsert(cleaned, { onConflict: "country_code" });
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
  }

  bustBusinessInfoCache();
  const fresh = await listCountryContacts();
  return json({ ok: true, rows: fresh });
}
